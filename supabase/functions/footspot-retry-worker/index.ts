// * footspot-retry-worker — scheduled (pg_cron, every 5 min).
// *
// * Re-drives footspot_event_log rows that failed and are due for a retry.
// * Re-invokes footspot-push-event with the SAME idempotency_key so the
// * existing log row is updated (attempts bumped) instead of duplicated.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'

const BATCH = 50

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const internalKey = req.headers.get('X-Internal-Call')
  const serviceRole = serviceRoleKey()
  if (!internalKey || !serviceRole || internalKey !== serviceRole) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) return jsonResponse({ error: 'SUPABASE_URL missing' }, { status: 500 })

  const sb = serviceClient()
  const nowIso = new Date().toISOString()

  const { data: due, error } = await sb
    .from('footspot_event_log')
    .select('idempotency_key, order_id, event_type')
    .eq('status', 'failed')
    .lte('next_retry_at', nowIso)
    .lt('attempts', 5)
    .order('next_retry_at', { ascending: true })
    .limit(BATCH)
  if (error) {
    console.error('[footspot-retry-worker]', error)
    return jsonResponse({ error: error.message }, { status: 500 })
  }
  if (!due?.length) return jsonResponse({ ok: true, processed: 0 })

  let ok = 0
  let failed = 0
  for (const row of due) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/footspot-push-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Call': serviceRole,
          Authorization: `Bearer ${serviceRole}`,
        },
        body: JSON.stringify({
          order_id: row.order_id,
          event_type: row.event_type,
          idempotency_key: row.idempotency_key,
        }),
      })
      if (res.ok) ok++
      else failed++
    } catch (e) {
      console.error('[footspot-retry-worker] re-invoke threw', row.idempotency_key, e)
      failed++
    }
  }

  return jsonResponse({ ok: true, processed: due.length, delivered: ok, still_failing: failed })
})
