// * footspot-push-event — builds + delivers one Footspot event.
// *
// * Called by the orders status trigger (pg_net) and by footspot-retry-worker.
// * Internal-only: caller must present the service role key in X-Internal-Call.
// *
// * The trigger passes { order_id, event_type } with a fresh idempotency key;
// * the retry worker re-passes the SAME idempotency key so the existing
// * footspot_event_log row is updated rather than duplicated.
// *
// * Backoff on failure: 5m → 15m → 1h → 4h → 24h, then give up + notify admin.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'
import { decryptApiToken } from '../_shared/footspot/cipher.ts'
import { postFootspot } from '../_shared/footspot/client.ts'

interface Payload {
  order_id: string
  event_type: 'order.created' | 'order.status_changed' | 'shipment.delivered' | 'order.refunded'
  idempotency_key?: string
}

// * Minutes until the next retry, indexed by the attempt that just failed.
const BACKOFF_MIN = [5, 15, 60, 240, 1440]

function backoffFor(attempts: number): string | null {
  // * attempts is the count AFTER the failure. attempts=1 → first retry in 5m.
  if (attempts >= BACKOFF_MIN.length) return null // * attempt 5 failed → give up
  const mins = BACKOFF_MIN[attempts - 1] ?? BACKOFF_MIN[BACKOFF_MIN.length - 1]
  return new Date(Date.now() + mins * 60_000).toISOString()
}

async function buildEnvelope(
  sb: ReturnType<typeof serviceClient>,
  order: Record<string, any>,
  footspotClubId: string,
  eventType: string,
): Promise<Record<string, unknown>> {
  const base = {
    id: `evt_${crypto.randomUUID()}`,
    type: eventType,
    version: 1,
    occurred_at: new Date().toISOString(),
    intersport_club_id: order.club_id,
    footspot_club_id: footspotClubId,
  }

  if (eventType === 'order.created') {
    const { data: items } = await sb
      .from('order_items')
      .select('quantity, size, unit_price_paid, flocking_name, flocking_number, ' +
              'footspot_discount_pct, fund_credit_snapshot, buying_price_snapshot, ' +
              'product:products(id, reference, name, image_path, is_pack, footspot_category), ' +
              'variant:product_variants(footspot_size)')
      .eq('order_id', order.id)

    const mapped: Record<string, unknown>[] = []
    for (const it of items ?? []) {
      const p = (it as any).product
      const isPack = !!p?.is_pack
      const footspotSize = (it as any).variant?.footspot_size ?? null
      // * Non-pack variants without a footspot_size are excluded.
      if (!isPack && !footspotSize) continue

      // * Pricing breakdown (SHOP_PERSONALIZATION_GUIDE.md §3.3). unit_price_paid
      // * is already the post-discount price; the original is reversed from the
      // * locked discount %. Margins use the order_item snapshots: the club
      // * fund credit is the club's margin, buying_price is Intersport's.
      const unitPaid = Number((it as any).unit_price_paid)
      const discountPct = Number((it as any).footspot_discount_pct ?? 0)
      const originalPrice = discountPct > 0 ? unitPaid / (1 - discountPct / 100) : unitPaid

      mapped.push({
        product_id: p?.id,
        product_reference: p?.reference,
        product_name: p?.name?.fr ?? p?.name ?? '',
        footspot_category: p?.footspot_category ?? null,
        image_path: p?.image_path ?? null,
        is_pack: isPack,
        footspot_size: isPack ? ((it as any).size ?? null) : footspotSize,
        quantity: (it as any).quantity,
        flocking_name: (it as any).flocking_name ?? null,
        flocking_number: (it as any).flocking_number ?? null,
        unit_price_paid: unitPaid,
        original_price_cents: Math.round(originalPrice * 100),
        price_cents: Math.round(unitPaid * 100),
        discount_pct_applied: discountPct,
        club_margin_cents: Math.round(Number((it as any).fund_credit_snapshot ?? 0) * 100),
        intersport_margin_cents: Math.round(Number((it as any).buying_price_snapshot ?? 0) * 100),
        currency: 'EUR',
      })
    }

    const buyerName = [order.guest_first_name, order.guest_last_name].filter(Boolean).join(' ')
    return {
      ...base,
      data: {
        intersport_order_id: order.id,
        order_number: order.order_number,
        order_date: order.created_at,
        buyer_name: buyerName,
        buyer_email: order.guest_email ?? null,
        footspot_member_id: order.footspot_member_id ?? null,
        items: mapped,
      },
    }
  }

  if (eventType === 'order.status_changed') {
    return {
      ...base,
      data: {
        intersport_order_id: order.id,
        order_number: order.order_number,
        new_status: order.status,
        shipping_tracking: order.shipping_tracking ?? null,
      },
    }
  }

  if (eventType === 'shipment.delivered') {
    return {
      ...base,
      data: {
        intersport_order_id: order.id,
        order_number: order.order_number,
        delivered_at: order.delivered_at ?? new Date().toISOString(),
      },
    }
  }

  // * order.refunded
  return {
    ...base,
    data: {
      intersport_order_id: order.id,
      order_number: order.order_number,
      refund_total: Number(order.refund_total ?? 0),
      currency: 'EUR',
    },
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const internalKey = req.headers.get('X-Internal-Call')
  const serviceRole = serviceRoleKey()
  if (!internalKey || !serviceRole || internalKey !== serviceRole) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 })
  }

  const sb = serviceClient()

  let body: Payload
  try {
    body = (await req.json()) as Payload
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body.order_id || !body.event_type) {
    return jsonResponse({ error: 'order_id and event_type required' }, { status: 400 })
  }
  const idempotencyKey = body.idempotency_key ?? crypto.randomUUID()

  // * Load order + club + active footspot link.
  const { data: order, error: oErr } = await sb
    .from('orders')
    .select('*')
    .eq('id', body.order_id)
    .single()
  if (oErr || !order) return jsonResponse({ error: 'order_not_found' }, { status: 404 })

  const { data: link } = await sb
    .from('footspot_links')
    .select('footspot_club_id, api_token_encrypted, status')
    .eq('club_id', order.club_id)
    .maybeSingle()
  if (!link || link.status !== 'active') {
    // * Club not linked — nothing to dispatch. Not an error.
    return jsonResponse({ ok: true, skipped: 'club_not_linked' })
  }

  // * Find or create the log row keyed by idempotency_key.
  const { data: existingLog } = await sb
    .from('footspot_event_log')
    .select('id, attempts, status')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existingLog?.status === 'sent' || existingLog?.status === 'acknowledged') {
    return jsonResponse({ ok: true, idempotent: true })
  }

  const envelope = await buildEnvelope(sb, order, link.footspot_club_id, body.event_type)

  let logId = existingLog?.id ?? null
  if (!logId) {
    const { data: inserted, error: insErr } = await sb
      .from('footspot_event_log')
      .insert({
        idempotency_key: idempotencyKey,
        club_id: order.club_id,
        order_id: order.id,
        event_type: body.event_type,
        payload: envelope,
        status: 'pending',
      })
      .select('id')
      .single()
    if (insErr) {
      console.error('[footspot-push-event] log insert', insErr)
      return jsonResponse({ error: insErr.message }, { status: 500 })
    }
    logId = inserted.id
  }

  // * Deliver.
  let bearer: string
  try {
    bearer = await decryptApiToken(link.api_token_encrypted)
  } catch (e) {
    console.error('[footspot-push-event] decrypt', e)
    bearer = ''
  }

  const res = bearer
    ? await postFootspot({
        path: 'intersport-events',
        bearer,
        body: envelope,
        idempotencyKey,
      })
    : { ok: false, status: 500, json: { error: 'decrypt_failed' }, raw: '' }

  if (res.ok) {
    await sb
      .from('footspot_event_log')
      .update({ status: 'sent', last_error: null, next_retry_at: null })
      .eq('id', logId)
    return jsonResponse({ ok: true, delivered: true })
  }

  // * Failure path: bump attempts, schedule retry or give up.
  const attempts = (existingLog?.attempts ?? 0) + 1
  const nextRetry = backoffFor(attempts)
  const errMsg = `HTTP ${res.status}: ${(res.raw || JSON.stringify(res.json)).slice(0, 400)}`

  await sb
    .from('footspot_event_log')
    .update({
      status: 'failed',
      attempts,
      last_error: errMsg,
      next_retry_at: nextRetry,
    })
    .eq('id', logId)

  if (nextRetry === null) {
    // * Exhausted all retries — alert the back-office.
    await sb.rpc('notify_backoffice', {
      p_kind: 'footspot_event_failed',
      p_payload: {
        order_id: order.id,
        order_number: order.order_number,
        event_type: body.event_type,
        attempts,
        last_error: errMsg,
      },
    })
  }

  return jsonResponse({ ok: false, attempts, next_retry_at: nextRetry }, { status: 502 })
})
