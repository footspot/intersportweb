// * Role guards for edge functions — every write passes through here first.
// * These re-check profiles.role server-side using the service-role client, so
// * a forged JWT that bypasses RLS still can't reach admin/employee endpoints.
import { serviceClient, userClient } from './supabase.ts'
import { jsonResponse } from './cors.ts'

export type Role = 'admin' | 'employee'

export interface AuthedUser {
  id: string
  email: string
  role: Role
}

// * Decode (without verifying — getUser already verified the token) the JWT
// * payload so we can inspect how the session was established.
function decodeJwtPayload(authHeader: string): Record<string, unknown> | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const part = token.split('.')[1]
    if (!part) return null
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

// * True when the session's `amr` (authentication methods reference) is present
// * but carries NO password method — i.e. it was established via the customer
// * passwordless flow (magic link / OTP), OAuth, etc. Back-office accounts must
// * sign in with a password on /admin/login (then 2FA), so such a session must
// * never reach admin/employee endpoints. Fail-open: if `amr` is absent or
// * unparseable we don't block, so a legitimate password admin is never locked
// * out by this check (their `amr` always includes "password").
function isNonPasswordSession(claims: Record<string, unknown> | null): boolean {
  const amr = claims?.amr as Array<unknown> | undefined
  if (!Array.isArray(amr) || amr.length === 0) return false
  const hasPassword = amr.some((m) => {
    const method = typeof m === 'string' ? m : (m as { method?: string })?.method
    return method === 'password'
  })
  return !hasPassword
}

async function resolveUser(req: Request): Promise<AuthedUser | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Missing auth header' }, { status: 401 })

  const uClient = userClient(authHeader)
  const { data: userRes, error: userErr } = await uClient.auth.getUser()
  if (userErr || !userRes?.user) {
    return jsonResponse({ error: 'Invalid session' }, { status: 401 })
  }

  const sb = serviceClient()
  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('id, email, role, active')
    .eq('id', userRes.user.id)
    .single()
  if (pErr || !profile) {
    return jsonResponse({ error: 'Profile not found' }, { status: 401 })
  }
  if (!profile.active) {
    return jsonResponse({ error: 'Account disabled' }, { status: 403 })
  }

  // * SECURITY: a back-office account on a passwordless (magic-link/OTP) session
  // * must be rejected here — that flow is the customer surface and would
  // * otherwise bypass the password + 2FA gate on /admin/login.
  if (
    (profile.role === 'admin' || profile.role === 'employee') &&
    isNonPasswordSession(decodeJwtPayload(authHeader))
  ) {
    return jsonResponse(
      { error: 'Back-office sessions must sign in with a password' },
      { status: 403 },
    )
  }

  return { id: profile.id, email: profile.email, role: profile.role as Role }
}

export async function verifyAdmin(req: Request): Promise<AuthedUser | Response> {
  const res = await resolveUser(req)
  if (res instanceof Response) return res
  if (res.role !== 'admin') {
    return jsonResponse({ error: 'Admin role required' }, { status: 403 })
  }
  return res
}

export async function verifyBackoffice(req: Request): Promise<AuthedUser | Response> {
  const res = await resolveUser(req)
  if (res instanceof Response) return res
  if (res.role !== 'admin' && res.role !== 'employee') {
    return jsonResponse({ error: 'Back-office role required' }, { status: 403 })
  }
  return res
}
