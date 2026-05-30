// * update-shop-access — Footspot pushes a club's shop access (private/password) state.
// *
// * v1.1 follow-up to the deferred "Shop password (private access)" item: a club
// * director toggles "Boutique privée" + sets a password from Footspot's "Accès &
// * Sécurité" card, without leaving Footspot. Footspot is the writer; the
// * Intersport clubs row is the source of truth the public shop + club-access read.
// *
// * Auth is the same inbound pipeline as update-shop-config: HMAC + per-club
// * Bearer, so the Bearer resolves to exactly the club whose access may change —
// * a club can never protect another club's shop. Hash/clear logic mirrors
// * admin-clubs /reset-password (bcrypt). See SHOP_PERSONALIZATION_GUIDE.md
// * §Update 2026-05-30.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { verifyFootspotClubAuth } from '../_shared/footspot/inbound.ts'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

// * Same library + cost factor as admin-clubs, so club-access's bcrypt.compareSync
// * verifies hashes set from either path. Sync variants avoid Web Workers, which
// * Supabase Edge Functions don't support.
function hashPassword(plain: string): string {
  const salt = bcrypt.genSaltSync(10)
  return bcrypt.hashSync(plain, salt)
}

const PASSWORD_MIN = 4

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

  // * is_password_protected is a required boolean.
  const isProtected = payload.is_password_protected
  if (typeof isProtected !== 'boolean') {
    return fail(422, 'invalid_input', 'is_password_protected must be a boolean')
  }

  const sb = serviceClient()
  const patch: Record<string, unknown> = {}

  if (isProtected === false) {
    // * Disable protection and clear any stored hash. Ignore any password sent.
    patch.is_password_protected = false
    patch.access_password_hash = null
  } else {
    // * Enabling protection. A present, non-null password sets/replaces the hash;
    // * an omitted password keeps the existing one (must already exist).
    const hasPassword = 'password' in payload && payload.password !== null && payload.password !== undefined
    if (hasPassword) {
      const pw = payload.password
      if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) {
        return fail(422, 'password_too_short', `password must be at least ${PASSWORD_MIN} characters`)
      }
      patch.is_password_protected = true
      patch.access_password_hash = hashPassword(pw)
    } else {
      // * Re-enable without a new password → keep the existing hash, if any.
      const { data: club, error: readErr } = await sb
        .from('clubs')
        .select('access_password_hash')
        .eq('id', auth.clubId)
        .maybeSingle()
      if (readErr) {
        console.error('[update-shop-access] read', readErr)
        return fail(500, 'update_failed', readErr.message)
      }
      if (!club) return fail(404, 'club_not_found', 'Club not found')
      if (!club.access_password_hash) {
        return fail(422, 'password_required', 'No existing password to keep; password is required')
      }
      patch.is_password_protected = true
    }
  }

  const { data, error } = await sb
    .from('clubs')
    .update(patch)
    .eq('id', auth.clubId)
    .select('id')
    .maybeSingle()
  if (error) {
    console.error('[update-shop-access] update', error)
    return fail(500, 'update_failed', error.message)
  }
  if (!data) return fail(404, 'club_not_found', 'Club not found')

  // * Idempotent — re-applying the same protection state is a no-op UPDATE.
  return jsonResponse({ ok: true, synced_at: new Date().toISOString() })
})
