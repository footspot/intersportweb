// * colissimo-tracking-worker — scheduled poller (Supabase cron, every 2h).
// *
// * Reads up to N shipped orders whose tracking_checked_at is stale, calls
// * Suivi v2 with the parcel number, writes one colissimo_tracking_log row
// * per poll, and flips status to `delivered` (or `cancelled` on return-to-
// * sender) when the event code is terminal.
// *
// * Required env:
// *   COLISSIMO_SUIVI_KEY    X-Okapi-Key from developer.laposte.fr
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'
import { sendOrderEmail } from '../_shared/emails/send.ts'

const SUIVI_BASE = 'https://api.laposte.fr/suivi/v2/idships'
const BATCH = 50
const STALE_HOURS = 2

const TERMINAL_DELIVERED = new Set(['DR1', 'MD2', 'LV1'])
const TERMINAL_RETURN = new Set(['RE1'])
// * "Out for delivery" — courier has the parcel for today's round. Notify
// * once on the transition; subsequent polls still showing TA1 must not
// * re-send (dedup via the order's previously stored tracking_status).
const OUT_FOR_DELIVERY = 'TA1'

function buildMagicLink(token: string): string {
  const base = (Deno.env.get('SITE_URL') ?? 'https://intesport-web.netlify.app').replace(/\/$/, '')
  return `${base}/order/${token}`
}

interface SuiviEvent {
  date?: string
  label?: string
  code?: string
  type?: string
}
interface SuiviResponse {
  shipment?: {
    idShip?: string
    isFinal?: boolean
    event?: SuiviEvent[]
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const suiviKey = Deno.env.get('COLISSIMO_SUIVI_KEY')
  if (!suiviKey) return jsonResponse({ error: 'suivi_key_missing' }, { status: 500 })

  // * Internal cron OR backoffice manual run. Either is fine; we still gate.
  const internalKey = req.headers.get('X-Internal-Call')
  const serviceRole = serviceRoleKey()
  if (!internalKey || !serviceRole || internalKey !== serviceRole) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 })
  }

  const sb = serviceClient()
  const cutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString()

  const { data: orders, error } = await sb
    .from('orders')
    .select('id, order_number, shipping_tracking, access_token, status, guest_email, guest_first_name, tracking_status')
    .eq('status', 'shipped')
    .not('shipping_tracking', 'is', null)
    .or(`tracking_checked_at.is.null,tracking_checked_at.lt.${cutoff}`)
    .limit(BATCH)
  if (error) {
    console.error('[tracking-worker]', error)
    return jsonResponse({ error: error.message }, { status: 500 })
  }
  if (!orders?.length) return jsonResponse({ ok: true, processed: 0 })

  const out: Array<{ order_id: string; code: string | null; status: string }> = []

  for (const order of orders) {
    const tracking = order.shipping_tracking as string
    try {
      const res = await fetch(`${SUIVI_BASE}/${encodeURIComponent(tracking)}`, {
        headers: { 'X-Okapi-Key': suiviKey, Accept: 'application/json' },
      })
      const json = (await res.json().catch(() => ({}))) as SuiviResponse
      const last: SuiviEvent | undefined = json.shipment?.event?.[0]
      const code = last?.code ?? null

      await sb.from('colissimo_tracking_log').insert({
        order_id: order.id,
        parcel_code: tracking,
        status_code: code,
        status_label: last?.label ?? null,
        event_date: last?.date ?? null,
        raw_payload: json,
      })

      const isDelivered = code && TERMINAL_DELIVERED.has(code)
      const isReturn = code && TERMINAL_RETURN.has(code)

      if (isDelivered) {
        await sb
          .from('orders')
          .update({
            status: 'delivered',
            delivered_at: last?.date ?? new Date().toISOString(),
            tracking_status: code,
            tracking_checked_at: new Date().toISOString(),
          })
          .eq('id', order.id)
        const recipient = order.guest_email
        if (recipient) {
          try {
            await sendOrderEmail({
              to: { email: recipient, name: order.guest_first_name ?? undefined },
              template: 'delivered',
              data: {
                customer_name: order.guest_first_name ?? '',
                order_number: order.order_number,
                tracking_number: tracking,
                tracking_url: `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(tracking)}`,
                magic_link: buildMagicLink(order.access_token),
              },
            })
          } catch (_) {
            /* non-fatal */
          }
        }
        out.push({ order_id: order.id, code, status: 'delivered' })
      } else if (isReturn) {
        await sb
          .from('orders')
          .update({
            status: 'cancelled',
            tracking_status: code,
            tracking_checked_at: new Date().toISOString(),
          })
          .eq('id', order.id)
        const recipient = order.guest_email
        if (recipient) {
          try {
            await sendOrderEmail({
              to: { email: recipient, name: order.guest_first_name ?? undefined },
              template: 'return-to-sender',
              data: {
                customer_name: order.guest_first_name ?? '',
                order_number: order.order_number,
                tracking_number: tracking,
                magic_link: buildMagicLink(order.access_token),
              },
            })
          } catch (_) {
            /* non-fatal */
          }
        }
        out.push({ order_id: order.id, code, status: 'cancelled' })
      } else {
        const isFirstOutForDelivery =
          code === OUT_FOR_DELIVERY && order.tracking_status !== OUT_FOR_DELIVERY
        await sb
          .from('orders')
          .update({ tracking_status: code, tracking_checked_at: new Date().toISOString() })
          .eq('id', order.id)
        if (isFirstOutForDelivery && order.guest_email) {
          try {
            await sendOrderEmail({
              to: { email: order.guest_email, name: order.guest_first_name ?? undefined },
              template: 'out-for-delivery',
              data: {
                customer_name: order.guest_first_name ?? '',
                order_number: order.order_number,
                tracking_number: tracking,
                tracking_url: `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(tracking)}`,
                magic_link: buildMagicLink(order.access_token),
              },
            })
          } catch (_) {
            /* non-fatal */
          }
        }
        out.push({ order_id: order.id, code, status: 'shipped' })
      }
    } catch (e) {
      console.error('[tracking-worker] poll failed', order.id, e)
      await sb
        .from('orders')
        .update({ tracking_checked_at: new Date().toISOString() })
        .eq('id', order.id)
    }

    // * Suivi v2 rate limit is 1 req/sec — stay safely under it.
    await new Promise((r) => setTimeout(r, 1100))
  }

  return jsonResponse({ ok: true, processed: out.length, items: out })
})
