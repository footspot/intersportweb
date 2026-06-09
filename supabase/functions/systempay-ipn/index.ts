// * systempay-ipn — single source of truth for payment confirmation.
// *
// * Lyra/SystemPay posts form-urlencoded with kr-answer (JSON string) + kr-
// * hash (HMAC-SHA256 hex). We verify the hash, dedupe via payment_events,
// * then mutate the order accordingly:
// *   - orderStatus = PAID                 → process_paid_order + email
// *   - orderStatus in (UNPAID, ABANDONED) → cancel
// *   - orderStatus = REFUNDED             → refunded
// *
// * Idempotency: every accepted event is recorded by (provider, event_id).
// * event_id is the Lyra transactions[0].uuid. Replays return 200 immediately.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'
import { sendOrderEmail } from '../_shared/emails/send.ts'

// * Fire-and-forget POST to another edge function in the same project. Used to
// * dispatch invoice generation after the order flips to paid. The IPN's 200
// * response to Lyra must not depend on this — Lyra retries on non-2xx and
// * we don't want a transient invoice-render hiccup to replay the whole IPN.
async function callInternal(name: string, body: Record<string, unknown>): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = serviceRoleKey()
  if (!url || !key) {
    console.error('[systempay-ipn] callInternal: missing SUPABASE_URL or service role key')
    return
  }
  try {
    const res = await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Call': key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[systempay-ipn] callInternal ${name} non-2xx`, { status: res.status, body: text.slice(0, 500) })
    }
  } catch (err) {
    console.error(`[systempay-ipn] callInternal ${name} threw`, err)
  }
}

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function extractPaymentMethod(tx: any): 'card' | 'paypal' {
  const candidates = [
    tx?.metadata?.paymentMethodType,
    tx?.transactionDetails?.cardDetails?.effectiveBrand,
    tx?.metadata?.brand,
  ]
    .filter((v) => typeof v === 'string')
    .map((v) => String(v).toUpperCase())
  if (candidates.some((c) => c.includes('PAYPAL'))) return 'paypal'
  return 'card'
}

function buildMagicLink(token: string): string {
  const base = (Deno.env.get('SITE_URL') ?? 'https://intesport-web.netlify.app').replace(/\/$/, '')
  return `${base}/order/${token}`
}

function buildShopUrl(): string {
  const base = (Deno.env.get('SITE_URL') ?? 'https://intesport-web.netlify.app').replace(/\/$/, '')
  return `${base}/`
}

// * Refund the full order total through Lyra Transaction/CancelOrRefund.
// *   resolutionMode=AUTO so Lyra picks cancel-vs-refund based on transaction
// *   state. Returns true on success, false on any error — the IPN proceeds
// *   either way (manual refund picks up the slack), but logs are loud.
async function lyraFullRefund(paymentId: string, amount: number): Promise<boolean> {
  const endpoint = Deno.env.get('SYSTEMPAY_ENDPOINT')
  const username = Deno.env.get('SYSTEMPAY_USERNAME')
  const password = Deno.env.get('SYSTEMPAY_PASSWORD')
  if (!endpoint || !username || !password) {
    console.error('[systempay-ipn] lyraFullRefund: missing creds')
    return false
  }
  const url = `https://${endpoint.replace(/^https?:\/\//, '')}/api-payment/V4/Transaction/CancelOrRefund`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${username}:${password}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uuid: paymentId,
        amount: Math.round(amount * 100),
        currency: 'EUR',
        resolutionMode: 'AUTO',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.status === 'ERROR') {
      console.error('[systempay-ipn] lyraFullRefund non-ok', { status: res.status, data })
      return false
    }
    return true
  } catch (err) {
    console.error('[systempay-ipn] lyraFullRefund threw', err)
    return false
  }
}

// * Race-loss handler: another order beat this one to the promo code. We have
// *   already captured payment from the customer. Cancel the order, refund
// *   Lyra, send the apology email, and audit the refund row.
async function handlePromoRaceLoss(
  sb: ReturnType<typeof serviceClient>,
  order: { id: string; order_number: string; total: number | string; guest_email: string | null; guest_first_name: string | null; access_token: string },
  paymentId: string,
): Promise<void> {
  const total = Number(order.total)
  await sb
    .from('orders')
    .update({
      status: 'cancelled',
      paid_at: new Date().toISOString(),
      refund_total: total,
    })
    .eq('id', order.id)

  const refunded = await lyraFullRefund(paymentId, total)
  await sb.from('refunds').insert({
    order_id: order.id,
    amount: total,
    reason: 'promo_race_loss',
    processor_ref: refunded ? paymentId : null,
  })

  try {
    const recipient = order.guest_email
    if (recipient) {
      const name = order.guest_first_name ?? undefined
      await sendOrderEmail({
        to: { email: recipient, name },
        template: 'promo-code-already-redeemed',
        data: {
          customer_name: order.guest_first_name ?? name ?? '',
          order_number: order.order_number,
          shop_url: buildShopUrl(),
        },
      })
    }
  } catch (e) {
    const detail = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
    console.error('[systempay-ipn] promo-race-loss email FAILED', {
      order_number: order.order_number,
      order_id: order.id,
      error: detail,
    })
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const rawText = await req.text()
  const form = new URLSearchParams(rawText)
  const krAnswer = form.get('kr-answer')
  const krHash = form.get('kr-hash')
  // * Lyra IPN signing modes:
  // *   'sha256_hmac' → signed with the dedicated HMAC-SHA-256 flag (preferred)
  // *   'password'    → signed with the REST private key
  // * The back-office IPN rule decides which one is sent; accept both so a
  // * config drift doesn't silently break payment confirmation.
  const krHashKey = form.get('kr-hash-key') ?? 'sha256_hmac'
  if (!krAnswer || !krHash) {
    return jsonResponse({ error: 'missing_kr_fields' }, { status: 400 })
  }
  const signingSecret =
    krHashKey === 'sha256_hmac'
      ? Deno.env.get('SYSTEMPAY_HMAC_KEY')
      : krHashKey === 'password'
        ? Deno.env.get('SYSTEMPAY_PASSWORD')
        : null
  if (signingSecret === null) {
    return jsonResponse({ error: 'unsupported_hash_key' }, { status: 400 })
  }
  if (!signingSecret) {
    return jsonResponse({ error: 'systempay_not_configured' }, { status: 500 })
  }

  const expected = await hmacSha256Hex(krAnswer, signingSecret)
  if (expected !== krHash) {
    console.warn('[systempay-ipn] hash mismatch', { mode: krHashKey })
    return jsonResponse({ error: 'invalid_hash' }, { status: 401 })
  }

  const sb = serviceClient()

  try {
    const payload = JSON.parse(krAnswer)
    const orderStatus: string | undefined = payload?.orderStatus
    const orderId: string | undefined = payload?.orderDetails?.orderId
    const txs: any[] = Array.isArray(payload?.transactions) ? payload.transactions : []
    const tx = txs[0]
    const eventId: string | undefined = tx?.uuid

    if (!orderStatus || !orderId || !eventId) {
      return jsonResponse({ error: 'malformed_payload' }, { status: 400 })
    }

    // * Idempotency: bail early if we've already processed this exact event.
    const { data: dupe } = await sb
      .from('payment_events')
      .select('id')
      .eq('provider', 'systempay')
      .eq('event_id', eventId)
      .maybeSingle()
    if (dupe) return new Response('OK!', { status: 200 })

    const { data: order, error: oErr } = await sb
      .from('orders')
      .select(
        'id, order_number, status, total, guest_email, guest_first_name, guest_last_name, access_token, delivery_method, club:clubs(name), pickup_shop:intersport_shops(name, city)',
      )
      .eq('order_number', orderId)
      .maybeSingle()
    if (oErr || !order) {
      console.warn('[systempay-ipn] order not found', { orderId })
      return new Response('OK!', { status: 200 })
    }

    if (orderStatus === 'PAID') {
      const paymentMethod = extractPaymentMethod(tx)

      // * Always record the Lyra transaction id on the order; the promo race-loss
      // *   path needs it to fire the refund.
      await sb
        .from('orders')
        .update({
          payment_method: paymentMethod,
          payment_id: eventId,
        })
        .eq('id', order.id)

      // * 1a. Promo code single-use claim. If another order already won the
      // *     race, cancel + refund + send the redeemed-elsewhere email.
      const { data: claimRes, error: claimErr } = await sb.rpc('claim_promo_for_order', {
        p_order_id: order.id,
      })
      if (claimErr) {
        console.error('[systempay-ipn] claim_promo_for_order failed', claimErr)
      }
      if (claimRes === false) {
        await handlePromoRaceLoss(sb, order, eventId)
        await sb.from('payment_events').insert({
          provider: 'systempay',
          event_id: eventId,
          order_id: order.id,
          event_type: 'PAID_PROMO_LOSS',
        })
        return new Response('OK!', { status: 200 })
      }

      // * 1b. Decrement stock + credit fund + flip status.
      const { error: rpcErr } = await sb.rpc('process_paid_order', { p_order_id: order.id })
      if (rpcErr) {
        console.error('[systempay-ipn] process_paid_order failed', rpcErr)
        // * Don't return 500 — Lyra will retry. Better to swallow and inspect.
      }

      await sb.from('payment_events').insert({
        provider: 'systempay',
        event_id: eventId,
        order_id: order.id,
        event_type: 'PAID',
      })

      // * Pre-generate the invoice PDF so it's ready when the buyer lands on
      // * the order page or downloads from the admin drawer. Idempotent —
      // * generate-invoice skips work when invoice_path is already set.
      await callInternal('generate-invoice', { order_id: order.id, locale: 'fr' })

      // * Confirmation email. Recipient resolution: guest_email first, else
      // * the user's profile email (looked up server-side).
      try {
        const recipient = order.guest_email
        if (recipient) {
          const name = order.guest_first_name
            ? `${order.guest_first_name} ${order.guest_last_name ?? ''}`.trim()
            : undefined

          const fmtEur = (n: number) =>
            new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)

          // * Pull the order lines to list product name / size / quantity in the email.
          const { data: items } = await sb
            .from('order_items')
            .select(
              'quantity, size, secondary_size, color, selected_options, unit_price_paid, status, flocking_name, flocking_initial, flocking_number, product:products(name, reference)',
            )
            .eq('order_id', order.id)

          // deno-lint-ignore no-explicit-any
          const itemsHtml = (items ?? [])
            .map((it: any) => {
              const pname = it.product?.name?.fr ?? it.product?.reference ?? 'Article'
              const sizeBits = [it.size, it.secondary_size].filter(Boolean).join(' / ')
              const flock = [it.flocking_name, it.flocking_initial, it.flocking_number]
                .filter(Boolean)
                .join(' · ')
              const optNames = Array.isArray(it.selected_options)
                ? it.selected_options.map((o: any) => o?.name).filter(Boolean).join(', ')
                : ''
              const sub = [
                it.color || '',
                sizeBits ? `Taille ${sizeBits}` : '',
                flock,
                optNames ? `Options : ${optNames}` : '',
              ]
                .filter(Boolean)
                .join(' · ')
              const oos = it.status === 'refunded_oos'
              const lineTotal = fmtEur(Number(it.unit_price_paid) * it.quantity)
              return (
                `<tr>` +
                `<td style="padding:8px 0;border-top:1px solid #eee;vertical-align:top${oos ? ';opacity:.6' : ''}">` +
                `<div style="font-weight:600">${pname} <span style="color:#888;font-weight:400">×${it.quantity}</span></div>` +
                (sub ? `<div style="color:#888;font-size:12px">${sub}</div>` : '') +
                (oos ? `<div style="color:#e30b0c;font-size:12px">Indisponible — remboursé</div>` : '') +
                `</td>` +
                `<td style="padding:8px 0;border-top:1px solid #eee;text-align:right;vertical-align:top;white-space:nowrap">${lineTotal}</td>` +
                `</tr>`
              )
            })
            .join('')

          // * Human-readable delivery mode, with the pickup location appended for
          // * club / shop pickups (so the buyer sees where to collect their order).
          // deno-lint-ignore no-explicit-any
          const o = order as any
          let deliveryLabel = 'Livraison à domicile (Colissimo)'
          if (o.delivery_method === 'club_pickup') {
            deliveryLabel = o.club?.name
              ? `Retrait au club — ${o.club.name}`
              : 'Retrait au club'
          } else if (o.delivery_method === 'shop_pickup') {
            const shop = o.pickup_shop
            const shopLabel = shop?.name
              ? `${shop.name}${shop.city ? ` (${shop.city})` : ''}`
              : ''
            deliveryLabel = shopLabel
              ? `Retrait en magasin Intersport — ${shopLabel}`
              : 'Retrait en magasin Intersport'
          }

          const paymentLabel =
            paymentMethod === 'paypal' ? 'PayPal' : paymentMethod === 'card' ? 'Carte bancaire' : '—'

          await sendOrderEmail({
            to: { email: recipient, name },
            template: 'payment-confirmed',
            data: {
              customer_name: order.guest_first_name ?? name ?? '',
              order_number: order.order_number,
              total: fmtEur(Number(order.total)),
              order_items: itemsHtml,
              payment_method_label: paymentLabel,
              delivery_method_label: deliveryLabel,
              magic_link: buildMagicLink(order.access_token),
            },
          })
        }
      } catch (e) {
        // * Brevo failures are non-fatal for the payment confirmation itself
        // * (the order is already paid), but they must be loud — silent
        // * swallow has burned us twice. Log the full error so it shows up
        // * in the function's stderr stream.
        const detail = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
        console.error('[systempay-ipn] payment-confirmed email FAILED', {
          order_number: order.order_number,
          order_id: order.id,
          recipient: order.guest_email,
          template: 'payment-confirmed',
          error: detail,
        })
      }
    } else if (orderStatus === 'UNPAID' || orderStatus === 'ABANDONED') {
      if (order.status === 'pending') {
        await sb.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
      }
      await sb.from('payment_events').insert({
        provider: 'systempay',
        event_id: eventId,
        order_id: order.id,
        event_type: orderStatus,
      })
    } else if (orderStatus === 'REFUNDED') {
      await sb.from('orders').update({ status: 'refunded' }).eq('id', order.id)
      await sb.from('payment_events').insert({
        provider: 'systempay',
        event_id: eventId,
        order_id: order.id,
        event_type: 'REFUNDED',
      })
    } else {
      // * RUNNING and other transient statuses: log only.
      await sb.from('payment_events').insert({
        provider: 'systempay',
        event_id: eventId,
        order_id: order.id,
        event_type: orderStatus,
      })
    }

    return new Response('OK!', { status: 200 })
  } catch (err) {
    console.error('[systempay-ipn]', err)
    // * Returning 200 here would cause Lyra to give up on a recoverable
    // * error. Return 500 so it retries.
    return jsonResponse({ error: 'internal_error' }, { status: 500 })
  }
})
