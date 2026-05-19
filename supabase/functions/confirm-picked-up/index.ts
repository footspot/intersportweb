// * confirm-picked-up — admin flips an awaiting_pickup order to its terminal
// * picked_up state when the customer actually collects the parcel. Sends
// * the picked-up confirmation email.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, userClient } from '../_shared/supabase.ts'
import { sendOrderEmail } from '../_shared/emails/send.ts'

interface Payload {
  order_id: string
}

function buildMagicLink(token: string): string {
  const base = (Deno.env.get('SITE_URL') ?? 'https://intesport-web.netlify.app').replace(/\/$/, '')
  return `${base}/order/${token}`
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'forbidden' }, { status: 401 })

  const sb = serviceClient()
  const { data: userRes } = await userClient(authHeader).auth.getUser()
  if (!userRes?.user) return jsonResponse({ error: 'invalid_session' }, { status: 401 })

  const { data: profile } = await sb
    .from('profiles')
    .select('role, active')
    .eq('id', userRes.user.id)
    .single()
  if (!profile?.active || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return jsonResponse({ error: 'backoffice_required' }, { status: 403 })
  }

  try {
    const body = (await req.json()) as Payload
    if (!body?.order_id) return jsonResponse({ error: 'order_id_required' }, { status: 400 })

    const { data: order, error } = await sb
      .from('orders')
      .select('*')
      .eq('id', body.order_id)
      .single()
    if (error || !order) return jsonResponse({ error: 'order_not_found' }, { status: 404 })
    if (order.status !== 'awaiting_pickup') {
      return jsonResponse({ error: 'order_not_awaiting_pickup', status: order.status }, { status: 409 })
    }

    await sb
      .from('orders')
      .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
      .eq('id', order.id)

    const recipient = order.guest_email
    if (recipient) {
      try {
        await sendOrderEmail({
          to: { email: recipient, name: order.guest_first_name ?? undefined },
          template: 'picked-up',
          data: {
            customer_name: order.guest_first_name ?? '',
            order_number: order.order_number,
            magic_link: buildMagicLink(order.access_token),
          },
        })
      } catch (e) {
        console.error('[confirm-picked-up] email failed', e)
      }
    }

    return jsonResponse({ ok: true, order: { id: order.id, status: 'picked_up' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[confirm-picked-up]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
