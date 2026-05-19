// * confirm-shipped — admin button. Only call when the package was actually
// * handed to La Poste; this is the trigger that unlocks tracking polling.
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

    if (order.delivery_method !== 'colissimo') {
      return jsonResponse({ error: 'not_a_colissimo_order' }, { status: 400 })
    }
    if (order.status !== 'paid' || !order.label_generated_at) {
      return jsonResponse(
        { error: 'not_ready_to_ship', status: order.status, has_label: !!order.label_generated_at },
        { status: 409 },
      )
    }

    await sb
      .from('orders')
      .update({ status: 'shipped', shipped_at: new Date().toISOString() })
      .eq('id', order.id)

    const recipient = order.guest_email
    if (recipient && order.shipping_tracking) {
      try {
        await sendOrderEmail({
          to: { email: recipient, name: order.guest_first_name ?? undefined },
          template: 'shipped',
          data: {
            customer_name: order.guest_first_name ?? '',
            order_number: order.order_number,
            tracking_number: order.shipping_tracking,
            tracking_url: `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(
              order.shipping_tracking,
            )}`,
            magic_link: buildMagicLink(order.access_token),
          },
        })
      } catch (e) {
        console.error('[confirm-shipped] email failed', e)
      }
    }

    return jsonResponse({ ok: true, order: { id: order.id, status: 'shipped' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[confirm-shipped]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
