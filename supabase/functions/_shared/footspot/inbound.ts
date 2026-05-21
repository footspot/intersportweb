// * Inbound auth for Footspot → Intersport calls that act on behalf of ONE
// * club — the shop-personalization endpoints (update-shop-config,
// * update-product-discounts, footspot-disconnect).
// *
// * Pipeline (SHOP_PERSONALIZATION_GUIDE.md §Phase 2):
// *   1. HMAC over the raw body, keyed by FOOTSPOT_SERVICE_SECRET (+ ±300s drift).
// *   2. X-Intersport-Partner-Id sanity-checked — single-tenant, so this only
// *      guards against an obviously misrouted request.
// *   3. Bearer = the calling club's api_token. Per-club tokens are stored
// *      ENCRYPTED (AES-GCM), not hashed, so resolution is decrypt-and-compare
// *      over every active footspot_links row. Few clubs → cheap enough.
import { verifyFootspotHmac } from './hmac.ts'
import { decryptApiToken } from './cipher.ts'
import { serviceClient } from '../supabase.ts'

export type FootspotClubAuth =
  | { ok: true; body: string; idempotencyKey: string; clubId: string; footspotClubId: string }
  | { ok: false; status: number; error: string }

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyFootspotClubAuth(req: Request): Promise<FootspotClubAuth> {
  // * 1. HMAC + timestamp drift.
  const hmac = await verifyFootspotHmac(req)
  if (!hmac.ok) return { ok: false, status: hmac.status, error: hmac.error }

  // * 2. Partner id — reject only on an explicit mismatch (header is optional
  // *    for Footspot → Intersport calls, see FOOTSPOT_INTEGRATION.md).
  const partnerId = Deno.env.get('INTERSPORT_PARTNER_ID')
  const headerPartner = req.headers.get('X-Intersport-Partner-Id')
  if (partnerId && headerPartner && headerPartner !== partnerId) {
    return { ok: false, status: 401, error: 'partner_mismatch' }
  }

  // * 3. Bearer → club. Decrypt every active link and match the raw token.
  const authHeader = req.headers.get('Authorization') ?? ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!bearer) return { ok: false, status: 401, error: 'missing_bearer' }

  const sb = serviceClient()
  const { data: links, error } = await sb
    .from('footspot_links')
    .select('club_id, footspot_club_id, api_token_encrypted')
    .eq('status', 'active')
  if (error) {
    console.error('[footspot/inbound] link lookup', error)
    return { ok: false, status: 500, error: 'link_lookup_failed' }
  }

  for (const link of links ?? []) {
    let token = ''
    try {
      token = await decryptApiToken(link.api_token_encrypted)
    } catch {
      continue
    }
    if (token && timingSafeEqual(token, bearer)) {
      return {
        ok: true,
        body: hmac.body,
        idempotencyKey: hmac.idempotencyKey,
        clubId: link.club_id,
        footspotClubId: String(link.footspot_club_id),
      }
    }
  }
  return { ok: false, status: 401, error: 'unknown_club_token' }
}
