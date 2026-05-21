// * update-shop-config — Footspot pushes a club's shop slogan + accent colour.
// *
// * Footspot is the writer; the Intersport clubs row is the source of truth the
// * public shop page renders from. Auth is HMAC + per-club Bearer: the Bearer
// * resolves to exactly the club whose config may be changed, so a club can
// * never edit another club's shop (SHOP_PERSONALIZATION_GUIDE.md §Phase 2).
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { verifyFootspotClubAuth } from '../_shared/footspot/inbound.ts'

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/
const SLOGAN_MAX = 80

function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return jsonResponse({ ok: false, error, message, ...extra }, { status })
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'POST only')

  const auth = await verifyFootspotClubAuth(req)
  if (!auth.ok) return fail(auth.status, auth.error, 'Authentication failed')

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(auth.body) as Record<string, unknown>
  } catch {
    return fail(400, 'invalid_json', 'Request body is not valid JSON')
  }

  // * The Bearer already resolved the club — the body must agree with it.
  if (payload.intersport_club_id !== auth.clubId) {
    return fail(403, 'forbidden_cross_club',
      'intersport_club_id does not match the authenticated club')
  }

  // * Build the patch. Distinguish an OMITTED field (leave alone) from a
  // * field present with JSON null (explicitly clear it).
  const patch: Record<string, unknown> = {}

  if ('slogan' in payload) {
    const raw = payload.slogan
    if (raw === null) {
      patch.slogan = null
    } else if (typeof raw !== 'string') {
      return fail(422, 'slogan_invalid_chars', 'slogan must be a string or null')
    } else if (/[\r\n]/.test(raw)) {
      return fail(422, 'slogan_invalid_chars', 'slogan must not contain line breaks')
    } else if (raw.length > SLOGAN_MAX) {
      return fail(422, 'slogan_too_long', `slogan must be ${SLOGAN_MAX} characters or fewer`)
    } else {
      patch.slogan = raw
    }
  }

  if ('accent_color' in payload) {
    const raw = payload.accent_color
    if (raw === null) {
      patch.accent_color = null
    } else if (typeof raw !== 'string' || !COLOR_RE.test(raw)) {
      return fail(422, 'invalid_color', 'accent_color must be a "#RRGGBB" hex string or null')
    } else {
      patch.accent_color = raw
    }
  }

  const syncedAt = new Date().toISOString()
  patch.shop_config_updated_at = syncedAt
  patch.shop_config_updated_via = 'footspot'

  const sb = serviceClient()
  const { error } = await sb.from('clubs').update(patch).eq('id', auth.clubId)
  if (error) {
    console.error('[update-shop-config]', error)
    return fail(500, 'update_failed', error.message)
  }

  // * Idempotent by construction — the same payload produces the same row.
  return jsonResponse({ ok: true, synced_at: syncedAt })
})
