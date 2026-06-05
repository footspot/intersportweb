// * footspot-disconnect — the club director tapped "Déconnecter" on Footspot.
// *
// * Revokes the club's footspot_links row so cross-platform sync stops (no more
// * outbound order events — footspot-push-event skips clubs whose link isn't
// * 'active'). The Intersport storefront itself stays fully open: checkout keeps
// * accepting new orders regardless of Footspot pairing state (client decision
// * 2026-06-05, overriding SHOP_PERSONALIZATION_GUIDE §2). Mirrors the admin
// * red "unlink" button. Re-pairing through footspot-pairing-complete restores it.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { verifyFootspotClubAuth } from '../_shared/footspot/inbound.ts'

function fail(status: number, error: string, message: string) {
  return jsonResponse({ ok: false, error, message }, { status })
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'POST only')

  const auth = await verifyFootspotClubAuth(req)
  if (!auth.ok) return fail(auth.status, auth.error, 'Authentication failed')

  let payload: { intersport_club_id?: unknown }
  try {
    payload = JSON.parse(auth.body)
  } catch {
    return fail(400, 'invalid_json', 'Request body is not valid JSON')
  }
  if (payload.intersport_club_id !== auth.clubId) {
    return fail(403, 'forbidden_cross_club',
      'intersport_club_id does not match the authenticated club')
  }

  const sb = serviceClient()
  const { data: club } = await sb
    .from('clubs')
    .select('id, name')
    .eq('id', auth.clubId)
    .maybeSingle()
  if (!club) return fail(404, 'club_not_found', 'Club not found')

  // * Idempotent — if there's no active link, a replay (or a club that already
  // * unlinked from the Intersport side) is a no-op success.
  const { data: link } = await sb
    .from('footspot_links')
    .select('id, status')
    .eq('club_id', auth.clubId)
    .maybeSingle()
  if (!link || link.status !== 'active') {
    return jsonResponse({ ok: true, idempotent: true })
  }

  // * Revoke the link (stops outbound sync) + clear the club's linked flag.
  const { error } = await sb
    .from('footspot_links')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', link.id)
  if (error) {
    console.error('[footspot-disconnect]', error)
    return fail(500, 'update_failed', error.message)
  }
  await sb.from('clubs').update({ footspot_linked: false }).eq('id', auth.clubId)

  // * Let the back-office know the shop went offline.
  await sb.rpc('notify_backoffice', {
    p_kind: 'footspot_shop_disconnected',
    p_payload: { club_id: club.id, club_name: club.name },
  })

  return jsonResponse({ ok: true })
})
