// * backoffice-orders — admin + employee order management (status, tracking).
// * Refunds go through the dedicated refund-order function. SystemPay IPN is
// * the only path that flips an order to 'paid' (process_paid_order runs
// * there), so this function never sets paid itself — it only handles
// * shipped/delivered/cancelled/refunded transitions + their event emails.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyBackoffice } from '../_shared/auth.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'

type Status =
  | 'pending'
  | 'paid'
  | 'partially_refunded'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

interface UpdateStatusPayload {
  id: string
  status: Status
}

interface SetTrackingPayload {
  id: string
  tracking: string | null
  mark_shipped?: boolean
}

async function callInternal(name: string, body: Record<string, unknown>): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRole = serviceRoleKey()
  if (!url || !serviceRole) return
  await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Call': serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
    body: JSON.stringify(body),
  }).catch((err) => console.error(`[backoffice-orders] internal ${name} failed`, err))
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const guard = await verifyBackoffice(req)
  if (guard instanceof Response) return guard

  const sb = serviceClient()
  // * Resolve the action from the last path segment. Supabase's edge runtime
  // * may or may not preserve the `/functions/v1/` prefix in req.url, so taking
  // * the LAST segment is the safest read of the action.
  const url = new URL(req.url)
  const segments = url.pathname.split('/').filter(Boolean)
  const action = segments[segments.length - 1] ?? ''

  try {
    if (req.method === 'POST' && action === 'status') {
      const body = (await req.json()) as UpdateStatusPayload
      if (!body?.id) return jsonResponse({ error: 'id required' }, { status: 400 })
      if (!body?.status) return jsonResponse({ error: 'status required' }, { status: 400 })

      // * Snapshot previous state so we can detect transitions.
      const { data: prev } = await sb
        .from('orders')
        .select('status, paid_at')
        .eq('id', body.id)
        .single()

      const patch: Record<string, unknown> = { status: body.status }
      if (body.status === 'shipped') patch.shipped_at = new Date().toISOString()
      if (body.status === 'delivered') patch.delivered_at = new Date().toISOString()
      if (body.status === 'paid') patch.paid_at = new Date().toISOString()

      const { data, error } = await sb
        .from('orders')
        .update(patch)
        .eq('id', body.id)
        .select()
        .single()
      if (error) throw error

      // * Transition side-effects — all fire-and-forget. The IPN owns the
      // * paid transition (stock + fund + invoice + email), so we only dispatch
      // * customer notifications for downstream states.
      if (body.status === 'shipped' && prev?.status !== 'shipped') {
        await callInternal('send-order-email', { order_id: body.id, event: 'shipped' })
      } else if (body.status === 'delivered' && prev?.status !== 'delivered') {
        await callInternal('send-order-email', { order_id: body.id, event: 'delivered' })
      } else if (body.status === 'refunded' && prev?.status !== 'refunded') {
        await callInternal('send-order-email', { order_id: body.id, event: 'refunded' })
      }

      return jsonResponse({ order: data })
    }

    if (req.method === 'POST' && action === 'tracking') {
      const body = (await req.json()) as SetTrackingPayload
      if (!body?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: prev } = await sb
        .from('orders')
        .select('status')
        .eq('id', body.id)
        .single()

      const patch: Record<string, unknown> = { shipping_tracking: body.tracking?.trim() || null }
      if (body.mark_shipped) {
        patch.status = 'shipped'
        patch.shipped_at = new Date().toISOString()
      }

      const { data, error } = await sb
        .from('orders')
        .update(patch)
        .eq('id', body.id)
        .select()
        .single()
      if (error) throw error

      if (body.mark_shipped && prev?.status !== 'shipped') {
        await callInternal('send-order-email', { order_id: body.id, event: 'shipped' })
      }

      return jsonResponse({ order: data })
    }

    return jsonResponse({ error: 'Method or action not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[backoffice-orders]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
