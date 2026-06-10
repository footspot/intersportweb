// * send-order-email — posts a transactional email via Brevo for an order event.
// *
// * Callable either internally (service-role: other edge functions dispatch it
// * with `X-Internal-Call: <service-role-key>`) or by an admin from the backoffice.
// * No public customer access.
//
// * Events supported:
// *   paid | partially_refunded | shipped | delivered | refunded
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey, userClient } from '../_shared/supabase.ts'

type OrderEvent = 'paid' | 'partially_refunded' | 'shipped' | 'delivered' | 'refunded'
type Locale = 'fr' | 'en'

interface Payload {
  order_id: string
  event: OrderEvent
  locale?: Locale
}

function fmt(v: number | string, locale: Locale) {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(v ?? 0))
}

function subjectFor(event: OrderEvent, orderNumber: string, locale: Locale): string {
  const s = {
    fr: {
      paid: `Votre commande ${orderNumber} est confirmée`,
      partially_refunded: `Votre commande ${orderNumber} (partiellement remboursée)`,
      shipped: `Votre commande ${orderNumber} a été expédiée`,
      delivered: `Votre commande ${orderNumber} a été livrée`,
      refunded: `Remboursement de la commande ${orderNumber}`,
    },
    en: {
      paid: `Your order ${orderNumber} is confirmed`,
      partially_refunded: `Your order ${orderNumber} (partial refund)`,
      shipped: `Your order ${orderNumber} has shipped`,
      delivered: `Your order ${orderNumber} has been delivered`,
      refunded: `Refund for order ${orderNumber}`,
    },
  }
  return s[locale][event]
}

function t(locale: Locale) {
  const d = {
    fr: {
      hello: 'Bonjour',
      recap: 'Récapitulatif',
      size: 'Taille',
      flocking: 'Flocage',
      outOfStock: 'Remboursé (rupture de stock)',
      subtotal: 'Sous-total',
      shipping: 'Livraison',
      refunds: 'Remboursements',
      total: 'Total',
      tracking: 'Suivi Colissimo',
      openTracking: 'Suivre mon colis',
      openOrder: 'Voir ma commande',
      thanks: 'Merci pour votre commande !',
      paidIntro: 'Votre paiement a bien été reçu. Voici le récapitulatif de votre commande :',
      partialIntro:
        'Votre paiement a été reçu. Certains articles étaient en rupture de stock et ont été remboursés automatiquement :',
      shippedIntro: 'Bonne nouvelle — votre commande est en route.',
      deliveredIntro: 'Votre commande vient d\'être livrée. Nous espérons que tout vous convient !',
      refundedIntro: 'Un remboursement vient d\'être effectué pour votre commande.',
      signature: 'L\'équipe Intersport Club IDF',
    },
    en: {
      hello: 'Hello',
      recap: 'Order summary',
      size: 'Size',
      flocking: 'Flocking',
      outOfStock: 'Refunded (out of stock)',
      subtotal: 'Subtotal',
      shipping: 'Shipping',
      refunds: 'Refunds',
      total: 'Total',
      tracking: 'Colissimo tracking',
      openTracking: 'Track my parcel',
      openOrder: 'View my order',
      thanks: 'Thanks for your order!',
      paidIntro: 'We\'ve received your payment. Here is your order summary:',
      partialIntro:
        'We\'ve received your payment. Some items were out of stock and have been automatically refunded:',
      shippedIntro: 'Good news — your order is on its way.',
      deliveredIntro: 'Your order was just delivered. We hope you love it!',
      refundedIntro: 'A refund has been processed on your order.',
      signature: 'The Intersport Club IDF team',
    },
  }
  return d[locale]
}

function renderHtml(opts: {
  event: OrderEvent
  locale: Locale
  order: any
  items: any[]
  refunds: any[]
  orderUrl: string
}): string {
  const l = t(opts.locale)
  const { order, items, refunds, event, orderUrl } = opts
  const loc = opts.locale

  let intro = l.paidIntro
  if (event === 'partially_refunded') intro = l.partialIntro
  if (event === 'shipped') intro = l.shippedIntro
  if (event === 'delivered') intro = l.deliveredIntro
  if (event === 'refunded') intro = l.refundedIntro

  const itemsHtml = items
    .map((it: any) => {
      const name =
        it.product?.name?.[loc] ?? it.product?.name?.fr ?? it.product_id
      const flocking = [it.flocking_name, it.flocking_initial, it.flocking_number && `#${it.flocking_number}`]
        .filter(Boolean)
        .join(' · ')
      const options = Array.isArray(it.selected_options)
        ? it.selected_options
            .map((o: any) => (o?.value ? `${o.name} : ${o.value}` : o?.name))
            .filter(Boolean)
            .join(', ')
        : ''
      const oos = it.status === 'refunded_oos'
      return `
        <tr style="border-top:1px solid #eee;${oos ? 'opacity:0.6;' : ''}">
          <td style="padding:10px 6px;">
            <div style="font-weight:600">${name}</div>
            <div style="font-size:12px;color:#888">
              ${l.size} ${it.size} · ×${it.quantity}
              ${flocking ? `· ${l.flocking}: ${flocking}` : ''}
              ${options ? `· ${options}` : ''}
            </div>
            ${oos ? `<div style="font-size:11px;color:#e30b0c">${l.outOfStock}</div>` : ''}
          </td>
          <td style="padding:10px 6px;text-align:right;white-space:nowrap">
            ${fmt(Number(it.unit_price_paid) * it.quantity, loc)}
          </td>
        </tr>`
    })
    .join('')

  const tracking = order.shipping_tracking
    ? `<p style="margin:16px 0">
         <strong>${l.tracking}:</strong>
         <a href="https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(order.shipping_tracking)}"
            style="color:#0331f9">${order.shipping_tracking}</a>
       </p>`
    : ''

  const refundSection =
    refunds?.length > 0
      ? `<p style="margin:16px 0 4px"><strong>${l.refunds}:</strong></p>
         <ul style="padding-left:18px;color:#555;font-size:14px">
           ${refunds.map((r: any) => `<li>${r.reason} — -${fmt(r.amount, loc)}</li>`).join('')}
         </ul>`
      : ''

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f7f7fb;color:#111;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 2px rgba(0,0,0,.05)">
    <h1 style="font-size:20px;margin:0 0 4px;color:#0331f9">Intersport Club IDF</h1>
    <p style="margin:0 0 16px;color:#555;font-size:13px">${order.order_number}</p>
    <p style="margin:0 0 8px">${l.hello},</p>
    <p style="margin:0 0 16px">${intro}</p>

    <h3 style="font-size:16px;margin:16px 0 4px">${l.recap}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${itemsHtml}</table>

    <table style="width:100%;margin-top:12px;font-size:14px">
      <tr><td style="color:#888">${l.subtotal}</td><td style="text-align:right">${fmt(order.subtotal, loc)}</td></tr>
      <tr><td style="color:#888">${l.shipping}</td><td style="text-align:right">${fmt(order.shipping_cost, loc)}</td></tr>
      ${Number(order.refund_total) > 0 ? `<tr><td style="color:#e30b0c">${l.refunds}</td><td style="text-align:right;color:#e30b0c">-${fmt(order.refund_total, loc)}</td></tr>` : ''}
      <tr><td style="font-weight:700;padding-top:6px">${l.total}</td><td style="text-align:right;font-weight:700;padding-top:6px">${fmt(order.total, loc)}</td></tr>
    </table>

    ${tracking}
    ${refundSection}

    <p style="margin:24px 0 8px">
      <a href="${orderUrl}" style="display:inline-block;background:#0331f9;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600">
        ${order.shipping_tracking ? l.openTracking : l.openOrder}
      </a>
    </p>

    <p style="margin-top:24px;color:#888;font-size:12px">— ${l.signature}</p>
  </div>
</body></html>`
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  // * Internal calls pass the service-role key in X-Internal-Call. Otherwise
  // * require an admin bearer token.
  const internalKey = req.headers.get('X-Internal-Call')
  const serviceRole = serviceRoleKey()
  const isInternal = !!internalKey && !!serviceRole && internalKey === serviceRole

  if (!isInternal) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing auth header' }, { status: 401 })
    const uClient = userClient(authHeader)
    const { data: userRes } = await uClient.auth.getUser()
    if (!userRes?.user) return jsonResponse({ error: 'Invalid session' }, { status: 401 })
    const sbCheck = serviceClient()
    const { data: profile } = await sbCheck
      .from('profiles')
      .select('role, active')
      .eq('id', userRes.user.id)
      .single()
    if (!profile || !profile.active || (profile.role !== 'admin' && profile.role !== 'employee')) {
      return jsonResponse({ error: 'Back-office role required' }, { status: 403 })
    }
  }

  const apiKey = Deno.env.get('BREVO_API_KEY')
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
  if (!apiKey || !senderEmail) {
    return jsonResponse({ error: 'Brevo not configured' }, { status: 500 })
  }

  const sb = serviceClient()

  try {
    const body = (await req.json()) as Payload
    if (!body?.order_id || !body?.event) {
      return jsonResponse({ error: 'order_id and event required' }, { status: 400 })
    }

    const { data: order, error: oErr } = await sb
      .from('orders')
      .select('*')
      .eq('id', body.order_id)
      .single()
    if (oErr || !order) return jsonResponse({ error: 'order not found' }, { status: 404 })

    const recipient = order.shipping_address?.email ?? order.guest_email
    if (!recipient) return jsonResponse({ error: 'no recipient' }, { status: 400 })

    const { data: items } = await sb
      .from('order_items')
      .select('*, product:products(name)')
      .eq('order_id', order.id)

    const { data: refunds } = await sb
      .from('refunds')
      .select('*')
      .eq('order_id', order.id)
      .order('processed_at', { ascending: false })

    const locale: Locale = body.locale ?? 'fr'
    const origin = Deno.env.get('SITE_URL') ?? new URL(req.url).origin.replace('functions.supabase.co', '')
    const orderUrl = `${origin.replace(/\/$/, '')}/orders/${order.id}`

    const html = renderHtml({
      event: body.event,
      locale,
      order,
      items: items ?? [],
      refunds: refunds ?? [],
      orderUrl,
    })

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: 'Intersport Club IDF' },
        to: [{
          email: recipient,
          name: [order.guest_first_name, order.guest_last_name].filter(Boolean).join(' ') || undefined,
        }],
        subject: subjectFor(body.event, order.order_number, locale),
        htmlContent: html,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('[send-order-email] Brevo error', json)
      return jsonResponse({ error: json?.message ?? 'Brevo error', raw: json }, { status: 500 })
    }

    return jsonResponse({ ok: true, to: recipient, messageId: json?.messageId ?? null })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[send-order-email]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
