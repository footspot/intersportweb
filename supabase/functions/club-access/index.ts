// * club-access — public endpoint to unlock a password-protected club.
// * Accepts { club_id, password }, verifies bcrypt against access_password_hash,
// * and returns a short-lived HMAC token the client stores in localStorage so
// * the shop stays unlocked for the session without re-prompting on every nav.
// *
// * The token is self-contained: `<club_id>.<expires_at_ms>.<hmac_hex>`.
// * Verifying doesn't need a DB lookup — just recompute the HMAC with the
// * CLUB_ACCESS_SECRET env var and compare.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

interface AccessPayload {
  club_id: string
  password: string
}

interface VerifyPayload {
  club_id: string
  token: string
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12          // * 12 h

async function signToken(clubId: string, expiresAt: number): Promise<string> {
  const secret = Deno.env.get('CLUB_ACCESS_SECRET') ?? serviceRoleKey() ?? ''
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const msg = new TextEncoder().encode(`${clubId}.${expiresAt}`)
  const sig = await crypto.subtle.sign('HMAC', key, msg)
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${clubId}.${expiresAt}.${hex}`
}

async function verifyToken(clubId: string, token: string): Promise<boolean> {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [tClub, expiresStr, sig] = parts
  if (tClub !== clubId) return false
  const expiresAt = Number(expiresStr)
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false
  const expected = await signToken(clubId, expiresAt)
  return expected === token && expected.split('.')[2] === sig
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  }

  const sb = serviceClient()
  const url = new URL(req.url)
  const action = url.pathname.split('/').filter(Boolean)[1] ?? ''

  try {
    if (action === 'verify') {
      const body = (await req.json()) as VerifyPayload
      if (!body?.club_id || !body?.token) {
        return jsonResponse({ error: 'club_id and token required' }, { status: 400 })
      }
      const ok = await verifyToken(body.club_id, body.token)
      return jsonResponse({ ok })
    }

    // * Default action: unlock the club with a password.
    const body = (await req.json()) as AccessPayload
    if (!body?.club_id) return jsonResponse({ error: 'club_id required' }, { status: 400 })
    if (!body?.password) return jsonResponse({ error: 'password required' }, { status: 400 })

    const { data: club, error: cErr } = await sb
      .from('clubs')
      .select('id, is_password_protected, access_password_hash')
      .eq('id', body.club_id)
      .single()
    if (cErr || !club) return jsonResponse({ error: 'club not found' }, { status: 404 })

    if (!club.is_password_protected || !club.access_password_hash) {
      // * Public club — no unlock needed.
      return jsonResponse({ ok: true, already_public: true })
    }

    // * Sync variant avoids Web Workers, which Supabase Edge Functions don't support.
    const match = bcrypt.compareSync(body.password, club.access_password_hash)
    if (!match) {
      return jsonResponse({ error: 'invalid_password' }, { status: 401 })
    }

    const expires = Date.now() + TOKEN_TTL_MS
    const token = await signToken(club.id, expires)
    return jsonResponse({ ok: true, token, expires_at: expires })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[club-access]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
