// * footspot-validate-purchase-code — checkout proxy (purchase code path).
// *
// * Customer pastes the 8-char code in the "Adhésion club" step. We look up
// * the active footspot_links for the club, decrypt the per-club api_token,
// * call Footspot's intersport-validate-purchase-code, and pass the response
// * through. Nothing is mutated on Intersport at this point — code
// * consumption happens on Footspot when it receives order.created.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { decryptApiToken } from '../_shared/footspot/cipher.ts'
import { postFootspot } from '../_shared/footspot/client.ts'

interface Payload {
  club_id?: string
  code?: string
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return jsonResponse({ valid: false, reason: 'invalid_request' }, { status: 400 })
  }
  if (!payload.club_id || !payload.code) {
    return jsonResponse({ valid: false, reason: 'missing_fields' }, { status: 400 })
  }
  const code = normalizeCode(payload.code)
  // * Purchase codes are 8 chars, no ambiguous (0/O/1/I/L) — see Footspot spec.
  if (!/^[A-HJ-KM-NP-Z2-9]{8}$/.test(code)) {
    return jsonResponse({ valid: false, reason: 'code_invalid' })
  }

  const sb = serviceClient()
  const { data: link } = await sb
    .from('footspot_links')
    .select('footspot_club_id, api_token_encrypted, status')
    .eq('club_id', payload.club_id)
    .maybeSingle()
  if (!link || link.status !== 'active') {
    return jsonResponse({ valid: false, reason: 'club_not_linked' })
  }

  let bearer: string
  try {
    bearer = await decryptApiToken(link.api_token_encrypted)
  } catch (e) {
    console.error('[footspot-validate-purchase-code] decrypt', e)
    return jsonResponse({ valid: false, reason: 'internal_error' }, { status: 500 })
  }

  const res = await postFootspot({
    path: 'intersport-validate-purchase-code',
    bearer,
    body: { code, footspot_club_id: link.footspot_club_id },
  })

  if (!res.ok || !res.json) {
    console.error('[footspot-validate-purchase-code] upstream', { status: res.status, raw: res.raw.slice(0, 300) })
    return jsonResponse({ valid: false, reason: 'upstream_error' }, { status: 502 })
  }

  // * Pass through. Footspot returns { valid, reason } or { valid, member_id, member_name }.
  return jsonResponse(res.json)
})
