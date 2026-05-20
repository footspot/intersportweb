// * validate-prepaid-code — proxy to Footspot's intersport-validate-prepaid-code.
// *
// * Unlike purchase codes, prepaid codes are NOT bound to a known club at
// * validation time (customer doesn't know which club issued it). The
// * Intersport proxy authenticates with the shop-level
// * INTERSPORT_FOOTSPOT_SERVICE_TOKEN; Footspot resolves the club from the
// * code itself and returns it.
// *
// * Validation is read-only — Footspot consumes the code only on receipt of
// * order.created. Cap returned here is re-fetched server-side in create-order
// * to avoid trusting client-cached values.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { postFootspot } from '../_shared/footspot/client.ts'

interface Payload {
  code?: string
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const bearer = Deno.env.get('INTERSPORT_FOOTSPOT_SERVICE_TOKEN')
  if (!bearer) {
    return jsonResponse({ valid: false, reason: 'not_configured' }, { status: 500 })
  }

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return jsonResponse({ valid: false, reason: 'invalid_request' }, { status: 400 })
  }
  const code = (payload.code ?? '').trim().toUpperCase().replace(/\s+/g, '')
  if (!code || code.length < 6) {
    return jsonResponse({ valid: false, reason: 'code_invalid' })
  }

  const res = await postFootspot({
    path: 'intersport-validate-prepaid-code',
    bearer,
    body: { code },
  })

  if (!res.ok || !res.json) {
    console.error('[validate-prepaid-code] upstream', { status: res.status, raw: res.raw.slice(0, 300) })
    return jsonResponse({ valid: false, reason: 'upstream_error' }, { status: 502 })
  }

  return jsonResponse(res.json)
})
