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
