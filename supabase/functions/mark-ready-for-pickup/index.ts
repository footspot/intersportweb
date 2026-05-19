// * mark-ready-for-pickup — admin flips a club/shop-pickup order to
// * status='awaiting_pickup' and sends the customer the "come collect"
// * email with the pickup location's address.
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
      .select(
        '*, club:clubs(name), shop:intersport_shops(name, address, postal_code, city)',
      )
      .eq('id', body.order_id)
      .single()
    if (error || !order) return jsonResponse({ error: 'order_not_found' }, { status: 404 })

    if (order.delivery_method !== 'club_pickup' && order.delivery_method !== 'shop_pickup') {
      return jsonResponse({ error: 'not_a_pickup_order' }, { status: 400 })
    }
    if (order.status !== 'paid') {
      return jsonResponse({ error: 'order_not_paid', status: order.status }, { status: 409 })
    }

    await sb
      .from('orders')
      .update({ status: 'awaiting_pickup', ready_for_pickup_at: new Date().toISOString() })
      .eq('id', order.id)

    // * Pickup location info — club name for club_pickup, shop info for shop_pickup.
    let pickupName = ''
    let pickupAddress = ''
    let pickupMapUrl = ''
    if (order.delivery_method === 'shop_pickup' && order.shop) {
      pickupName = order.shop.name
      pickupAddress = [order.shop.address, order.shop.postal_code, order.shop.city]
        .filter(Boolean)
        .join(', ')
      pickupMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickupAddress)}`
    } else if (order.club) {
      pickupName = order.club.name
      pickupAddress = '' // * club address is not in DB yet — admin keeps in mind
      pickupMapUrl = ''
    }

    const recipient = order.guest_email
    if (recipient) {
      try {
        await sendOrderEmail({
          to: { email: recipient, name: order.guest_first_name ?? undefined },
          template: 'ready-for-pickup',
          data: {
            customer_name: order.guest_first_name ?? '',
            order_number: order.order_number,
            pickup_location_name: pickupName,
            pickup_location_address: pickupAddress,
            pickup_map_url: pickupMapUrl,
            magic_link: buildMagicLink(order.access_token),
          },
        })
      } catch (e) {
        console.error('[mark-ready-for-pickup] email failed', e)
      }
    }

    return jsonResponse({ ok: true, order: { id: order.id, status: 'awaiting_pickup' } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[mark-ready-for-pickup]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
