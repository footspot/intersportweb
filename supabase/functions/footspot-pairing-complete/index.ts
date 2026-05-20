// * footspot-pairing-complete — activation callback (Flow 1 and Flow 2 land here).
// *
// * Footspot PDG accepted the pairing on their side and now hands us the
// * footspot_club_id + api_token to store. Idempotent: replays return 200 OK
// * if the active link already exists.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { verifyFootspotHmac } from '../_shared/footspot/hmac.ts'
import { encryptApiToken } from '../_shared/footspot/cipher.ts'

interface Payload {
  intersport_club_id?: string
  footspot_club_id?: string | number
  api_token?: string
}

function isUuid(s: string | undefined | null): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const v = await verifyFootspotHmac(req)
  if (!v.ok) return jsonResponse({ error: v.error }, { status: v.status })

  let payload: Payload
  try {
    payload = JSON.parse(v.body)
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 })
  }
  if (!isUuid(payload.intersport_club_id) || !payload.footspot_club_id || !payload.api_token) {
    return jsonResponse({ error: 'missing_fields' }, { status: 400 })
  }
  const footspotClubId = String(payload.footspot_club_id)

  const sb = serviceClient()

  // * Verify club exists.
  const { data: club } = await sb
    .from('clubs')
    .select('id, name')
    .eq('id', payload.intersport_club_id)
    .maybeSingle()
  if (!club) return jsonResponse({ error: 'club_not_found' }, { status: 404 })

  // * Idempotency: if an active link with the same (club, footspot_club) exists, return 200.
  const { data: existing } = await sb
    .from('footspot_links')
    .select('id, footspot_club_id, status')
    .eq('club_id', payload.intersport_club_id)
    .maybeSingle()
  if (existing && existing.status === 'active' && existing.footspot_club_id === footspotClubId) {
    return jsonResponse({ ok: true, idempotent: true })
  }

  const encrypted = await encryptApiToken(payload.api_token)

  // * Upsert: replace any revoked row for this club, or insert fresh.
  if (existing) {
    const { error } = await sb
      .from('footspot_links')
      .update({
        footspot_club_id: footspotClubId,
        api_token_encrypted: encrypted,
        status: 'active',
        linked_at: new Date().toISOString(),
        revoked_at: null,
      })
      .eq('id', existing.id)
    if (error) {
      console.error('[footspot-pairing-complete] update', error)
      return jsonResponse({ error: error.message }, { status: 500 })
    }
  } else {
    const { error } = await sb.from('footspot_links').insert({
      club_id: payload.intersport_club_id,
      footspot_club_id: footspotClubId,
      api_token_encrypted: encrypted,
    })
    if (error) {
      console.error('[footspot-pairing-complete] insert', error)
      return jsonResponse({ error: error.message }, { status: 500 })
    }
  }

  await sb.from('clubs').update({ footspot_linked: true }).eq('id', payload.intersport_club_id)

  // * If a pending Flow 2 request exists, mark it completed.
  await sb
    .from('footspot_integration_requests')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('club_id', payload.intersport_club_id)
    .eq('status', 'sent')

  // * Notify all admins/employees through the bell.
  await sb.rpc('notify_backoffice', {
    p_kind: 'footspot_link_active',
    p_payload: {
      club_id: payload.intersport_club_id,
      club_name: club.name,
      footspot_club_id: footspotClubId,
    },
  })

  return jsonResponse({ ok: true })
})
