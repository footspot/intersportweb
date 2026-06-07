// * lookup-club-by-id — called by Footspot in Flow 1, pre-pairing.
// *
// * Footspot extracts the UUID from the Intersport shop URL the director
// * pasted (path /club/{uuid}) and resolves it to the public club info plus
// * the footspot_linked flag. Auth is HMAC-only — no link exists yet, so no
// * Bearer is checked. verify_jwt=false in config.toml.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { verifyFootspotHmac } from '../_shared/footspot/hmac.ts'

function isUuid(s: string | undefined | null): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const v = await verifyFootspotHmac(req)
  if (!v.ok) return jsonResponse({ error: v.error }, { status: v.status })

  let payload: { club_id?: string }
  try {
    payload = JSON.parse(v.body)
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 })
  }
  if (!isUuid(payload.club_id)) {
    return jsonResponse({ error: 'invalid_club_id' }, { status: 400 })
  }

  const sb = serviceClient()
  const { data, error } = await sb
    .from('clubs')
    .select('id, name, footspot_linked, logo_path')
    .eq('id', payload.club_id)
    .maybeSingle()
  if (error) {
    console.error('[lookup-club-by-id]', error)
    return jsonResponse({ error: error.message }, { status: 500 })
  }
  if (!data) return jsonResponse({ error: 'not_found' }, { status: 404 })

  // * Public URL for the club crest so Footspot's PDG app can show it next to
  // * the Footspot club logo for a visual match check before accepting.
  const base = Deno.env.get('SUPABASE_URL') ?? ''
  const logo_url = data.logo_path
    ? `${base}/storage/v1/object/public/club-logos/${data.logo_path}`
    : null

  return jsonResponse({
    club_id: data.id,
    name: data.name,
    footspot_linked: !!data.footspot_linked,
    logo_url,
  })
})
