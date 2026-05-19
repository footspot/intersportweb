// * create-form-token — mints a SystemPay (Lyra) formToken for the Smart-
// * form. Server-to-server call to /api-payment/V4/Charge/CreatePayment.
// *
// * Auth model: customers pass an Authorization header OR the order's
// * access_token (guests). We re-read the order server-side from access_token
// * + id — never trust the client total.
// *
// * Required secrets (Edge Function env):
// *   SYSTEMPAY_ENDPOINT     e.g. "api.systempay.fr" (no scheme)
// *   SYSTEMPAY_USERNAME     numeric shop id
// *   SYSTEMPAY_PASSWORD     REST private key (testprivatekey_… / prodpassword_…)
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'

interface Payload {
  order_id: string
  access_token?: string
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const endpoint = Deno.env.get('SYSTEMPAY_ENDPOINT')
  const username = Deno.env.get('SYSTEMPAY_USERNAME')
  const password = Deno.env.get('SYSTEMPAY_PASSWORD')
  if (!endpoint || !username || !password) {
    return jsonResponse({ error: 'systempay_not_configured' }, { status: 500 })
  }

  const sb = serviceClient()

  try {
    const body = (await req.json()) as Payload
    if (!body?.order_id) return jsonResponse({ error: 'order_id_required' }, { status: 400 })

    const { data: order, error } = await sb
      .from('orders')
      .select('*')
      .eq('id', body.order_id)
      .single()
    if (error || !order) return jsonResponse({ error: 'order_not_found' }, { status: 404 })

    if (order.status !== 'pending') {
      return jsonResponse({ error: 'order_not_pending', status: order.status }, { status: 409 })
    }
    if (Number(order.total) <= 0) {
      return jsonResponse({ error: 'order_total_zero' }, { status: 400 })
    }

    // * Authenticate caller via the order's access_token (every order is a
    // * guest order — there's no user identity to check against).
    if (!body.access_token || body.access_token !== order.access_token) {
      return jsonResponse({ error: 'forbidden' }, { status: 403 })
    }

    // * Customer + billing details — Lyra uses these for SCA and fraud scoring.
    const addr = order.shipping_address ?? {}
    const firstName = order.guest_first_name ?? null
    const lastName = order.guest_last_name ?? null
    const email = order.guest_email ?? addr.email ?? null

    const amountCents = Math.round(Number(order.total) * 100)

    const lyraBody = {
      amount: amountCents,
      currency: 'EUR',
      orderId: order.order_number,
      formAction: 'PAYMENT',
      customer: {
        email,
        reference: order.id,
        billingDetails: {
          firstName,
          lastName,
          phoneNumber: addr.phone ?? null,
          address: addr.line1 ?? null,
          zipCode: addr.postal_code ?? null,
          city: addr.city ?? null,
          country: addr.country === 'France' ? 'FR' : (addr.country ?? 'FR'),
          language: 'fr',
        },
      },
    }

    const url = `https://${endpoint.replace(/^https?:\/\//, '')}/api-payment/V4/Charge/CreatePayment`
    const basic = btoa(`${username}:${password}`)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(lyraBody),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.status === 'ERROR') {
      console.error('[create-form-token] Lyra error', { status: res.status, data })
      return jsonResponse(
        { error: 'systempay_error', detail: data?.answer ?? data ?? null },
        { status: 502 },
      )
    }
    const formToken = data?.answer?.formToken
    if (!formToken) {
      return jsonResponse({ error: 'systempay_no_form_token', detail: data }, { status: 502 })
    }

    return jsonResponse({ ok: true, form_token: formToken })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[create-form-token]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
