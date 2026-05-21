// * footspot-disconnect — the club director tapped "Déconnecter" on Footspot.
// *
// * Marks the club's shop 'disconnected' so create-order refuses NEW checkouts.
// * Orders already in flight keep delivering — the footspot_links row stays
// * active so their lifecycle events still dispatch (SHOP_PERSONALIZATION_GUIDE
// * §Phase 2). Re-pairing through footspot-pairing-complete brings it back.
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
    .select('id, name, shop_status')
    .eq('id', auth.clubId)
    .maybeSingle()
  if (!club) return fail(404, 'club_not_found', 'Club not found')

  // * Idempotent — a replay of the disconnect is a no-op success.
  if (club.shop_status === 'disconnected') {
    return jsonResponse({ ok: true, idempotent: true })
  }

  const { error } = await sb
    .from('clubs')
    .update({ shop_status: 'disconnected' })
    .eq('id', auth.clubId)
  if (error) {
    console.error('[footspot-disconnect]', error)
    return fail(500, 'update_failed', error.message)
  }

  // * Let the back-office know the shop went offline.
  await sb.rpc('notify_backoffice', {
    p_kind: 'footspot_shop_disconnected',
    p_payload: { club_id: club.id, club_name: club.name },
  })

  return jsonResponse({ ok: true })
})
