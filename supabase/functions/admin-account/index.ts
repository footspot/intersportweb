// * admin-account — lets the signed-in back-office user manage their OWN
// * account: display name, email address and password. Every action operates
// * strictly on the caller's own user id (taken from the verified JWT), never
// * on an arbitrary one — so this endpoint can't be used to touch other users.
// *
// * 2FA (TOTP) is NOT handled here: the supabase.auth.mfa.* APIs run entirely
// * against the caller's own session in the browser and need no service role.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient, userClient } from '../_shared/supabase.ts'

interface ProfilePayload {
  action: 'profile'
  full_name?: string
}
interface EmailPayload {
  action: 'email'
  email: string
  current_password: string
}
interface PasswordPayload {
  action: 'password'
  current_password: string
  new_password: string
}
type Payload = ProfilePayload | EmailPayload | PasswordPayload

const PROFILE_COLS = 'id, email, full_name, role, active, created_at'

// * Re-authenticate the caller with their current password. Returns true only
// * when the password is correct. Uses a throwaway anon client so it never
// * carries any privilege — it just asks the auth server "is this password ok?".
async function passwordValid(email: string, password: string): Promise<boolean> {
  if (!password) return false
  const { error } = await userClient(null).auth.signInWithPassword({ email, password })
  return !error
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  }

  // * verifyAdmin re-checks profiles.role server-side and gives us the
  // * caller's own id — the only id this function ever writes to.
  const guard = await verifyAdmin(req)
  if (guard instanceof Response) return guard
  const uid = guard.id

  const sb = serviceClient()

  try {
    const body = (await req.json()) as Payload

    // * Resolve the auth email straight from auth.users — that is what
    // * signInWithPassword checks, and it could differ from a stale profiles row.
    const { data: authData, error: authErr } = await sb.auth.admin.getUserById(uid)
    if (authErr || !authData?.user?.email) throw new Error('account not found')
    const currentEmail = authData.user.email

    // ----- Display name -------------------------------------------------
    if (body.action === 'profile') {
      const full_name = body.full_name?.trim() || null
      const { data, error } = await sb
        .from('profiles')
        .update({ full_name })
        .eq('id', uid)
        .select(PROFILE_COLS)
        .single()
      if (error) throw error
      return jsonResponse({ profile: data })
    }

    // ----- Email address ------------------------------------------------
    if (body.action === 'email') {
      const email = body.email?.trim().toLowerCase()
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse({ error: 'invalid_email' }, { status: 400 })
      }
      if (!(await passwordValid(currentEmail, body.current_password))) {
        return jsonResponse({ error: 'wrong_password' }, { status: 403 })
      }

      if (email !== currentEmail) {
        // * email_confirm: true → change applies immediately, no confirmation
        // * mail (the caller already proved ownership with their password).
        const { error: updErr } = await sb.auth.admin.updateUserById(uid, {
          email,
          email_confirm: true,
        })
        if (updErr) {
          const msg = (updErr.message ?? '').toLowerCase()
          if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
            return jsonResponse({ error: 'email_taken' }, { status: 409 })
          }
          throw updErr
        }
      }

      // * Keep the profiles mirror in sync with auth.users.
      const { data, error } = await sb
        .from('profiles')
        .update({ email })
        .eq('id', uid)
        .select(PROFILE_COLS)
        .single()
      if (error) throw error
      return jsonResponse({ profile: data })
    }

    // ----- Password -----------------------------------------------------
    if (body.action === 'password') {
      const newPw = body.new_password ?? ''
      if (newPw.length < 8) {
        return jsonResponse({ error: 'weak_password' }, { status: 400 })
      }
      if (!(await passwordValid(currentEmail, body.current_password))) {
        return jsonResponse({ error: 'wrong_password' }, { status: 403 })
      }
      const { error: updErr } = await sb.auth.admin.updateUserById(uid, { password: newPw })
      if (updErr) {
        const msg = (updErr.message ?? '').toLowerCase()
        if (msg.includes('password')) {
          return jsonResponse({ error: 'weak_password' }, { status: 400 })
        }
        throw updErr
      }
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'unknown action' }, { status: 400 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-account]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
