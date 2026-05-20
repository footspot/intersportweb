// * footspot-admin — admin-only actions for the Footspot integration page.
// *
// *   action = 'unlink'        → revoke a club's Footspot link. Ongoing orders
// *                              still process; only new event dispatch stops.
// *   action = 'resend_event'  → re-drive a failed footspot_event_log row by
// *                              re-invoking footspot-push-event with the same
// *                              idempotency key (so the row updates in place).
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'

interface Payload {
  action?: 'unlink' | 'resend_event'
  club_id?: string
  event_log_id?: string
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const guard = await verifyAdmin(req)
  if (guard instanceof Response) return guard

  const sb = serviceClient()

  let body: Payload
  try {
    body = (await req.json()) as Payload
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    if (body.action === 'unlink') {
      if (!body.club_id) return jsonResponse({ error: 'club_id required' }, { status: 400 })
      const { data: link } = await sb
        .from('footspot_links')
        .select('id, status')
        .eq('club_id', body.club_id)
        .maybeSingle()
      if (!link || link.status !== 'active') {
        return jsonResponse({ error: 'no_active_link' }, { status: 404 })
      }
      await sb
        .from('footspot_links')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('id', link.id)
      await sb.from('clubs').update({ footspot_linked: false }).eq('id', body.club_id)
      return jsonResponse({ ok: true })
    }

    if (body.action === 'resend_event') {
      if (!body.event_log_id) return jsonResponse({ error: 'event_log_id required' }, { status: 400 })
      const { data: row } = await sb
        .from('footspot_event_log')
        .select('idempotency_key, order_id, event_type, status')
        .eq('id', body.event_log_id)
        .maybeSingle()
      if (!row) return jsonResponse({ error: 'event_not_found' }, { status: 404 })
      if (row.status === 'sent' || row.status === 'acknowledged') {
        return jsonResponse({ ok: true, idempotent: true })
      }

      const url = Deno.env.get('SUPABASE_URL')
      const key = serviceRoleKey()
      if (!url || !key) return jsonResponse({ error: 'not_configured' }, { status: 500 })

      const res = await fetch(`${url}/functions/v1/footspot-push-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Call': key,
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          order_id: row.order_id,
          event_type: row.event_type,
          idempotency_key: row.idempotency_key,
        }),
      })
      return jsonResponse({ ok: res.ok, delivered: res.ok })
    }

    return jsonResponse({ error: 'unknown_action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[footspot-admin]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
