// * admin-users — provision admin/employee accounts. Admin only.
// * Customers self-register on the storefront and are NOT managed here.
// * Last-admin guard: cannot demote or deactivate the only active admin.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { sendOrderEmail } from '../_shared/emails/send.ts'

type Role = 'admin' | 'employee'

interface CreatePayload {
  email: string
  full_name?: string
  role: Role
  active?: boolean
  password?: string      // * optional — if omitted we generate one and return it
}

interface UpdatePayload {
  id: string
  full_name?: string
  role?: Role
  active?: boolean
}

function randomPassword(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
}

async function countActiveAdmins(sb: ReturnType<typeof serviceClient>): Promise<number> {
  const { count, error } = await sb
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('active', true)
  if (error) throw error
  return count ?? 0
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const guard = await verifyAdmin(req)
  if (guard instanceof Response) return guard

  const sb = serviceClient()
  const url = new URL(req.url)

  try {
    if (req.method === 'POST') {
      const body = (await req.json()) as CreatePayload
      if (!body?.email?.trim()) return jsonResponse({ error: 'email required' }, { status: 400 })
      if (body.role !== 'admin' && body.role !== 'employee') {
        return jsonResponse({ error: 'role must be admin or employee' }, { status: 400 })
      }
      const email = body.email.trim().toLowerCase()
      const password = body.password?.trim() || randomPassword()

      // * Create auth user (email_confirm: true → skip verification email)
      const { data: authData, error: authErr } = await sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: body.full_name ? { full_name: body.full_name.trim() } : undefined,
      })
      if (authErr) throw authErr
      const uid = authData.user?.id
      if (!uid) throw new Error('auth user id missing')

      // * Trigger inserts a profile with role='employee'. Promote to admin if asked.
      const { data: profile, error: pErr } = await sb
        .from('profiles')
        .update({
          role: body.role,
          full_name: body.full_name?.trim() || null,
          active: body.active ?? true,
        })
        .eq('id', uid)
        .select()
        .single()
      if (pErr) {
        // * Roll back the auth user if we couldn't set the role
        await sb.auth.admin.deleteUser(uid).catch(() => {})
        throw pErr
      }

      // * Back-office accounts sign in with email + password at /admin/login.
      // * A Supabase magic link is no use here — it redirects to the storefront,
      // * which has no login flow, and is single-use anyway. Always point to the
      // * canonical production admin login (never the caller's localhost origin
      // * nor the Netlify preview domain that SITE_URL may carry).
      const loginLink = 'https://intersportclubidf.com/admin/login'

      // * Email the new account holder their credentials instead of showing the
      // * password on screen. If sending fails (e.g. Brevo down), fall back to
      // * returning the password so the admin can still relay it manually.
      let emailed = false
      // * Only email when WE generated the password — a caller-supplied password
      // * is already known to the admin and shouldn't be echoed by email.
      if (!body.password) {
        try {
          await sendOrderEmail({
            to: { email, name: body.full_name?.trim() || email },
            template: 'account-created',
            data: {
              full_name: body.full_name?.trim() || email,
              email,
              password,
              login_link: loginLink,
            },
          })
          emailed = true
        } catch (mailErr) {
          console.error('[admin-users] credentials email failed', mailErr)
        }
      }

      return jsonResponse(
        {
          user: profile,
          emailed,
          // * Surface the password only when we couldn't email it (or none was generated).
          temporary_password: body.password || emailed ? undefined : password,
          login_link: loginLink,
        },
        { status: 201 },
      )
    }

    if (req.method === 'PUT') {
      const body = (await req.json()) as UpdatePayload
      if (!body?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      // * Last-admin guard: if we're demoting or deactivating an admin, make sure
      // * another active admin will still exist.
      const { data: current, error: cErr } = await sb
        .from('profiles')
        .select('id, role, active')
        .eq('id', body.id)
        .single()
      if (cErr) throw cErr

      const becomingNonAdmin = current.role === 'admin' && body.role && body.role !== 'admin'
      const becomingInactive = current.role === 'admin' && current.active && body.active === false
      if (becomingNonAdmin || becomingInactive) {
        const adminCount = await countActiveAdmins(sb)
        if (adminCount <= 1) {
          return jsonResponse({ error: 'last_admin' }, { status: 409 })
        }
      }

      const patch: Record<string, unknown> = {}
      if (body.full_name !== undefined) patch.full_name = body.full_name?.trim() || null
      if (body.role) {
        if (body.role !== 'admin' && body.role !== 'employee') {
          return jsonResponse({ error: 'role must be admin or employee' }, { status: 400 })
        }
        patch.role = body.role
      }
      if (body.active !== undefined) patch.active = !!body.active

      const { data: profile, error: pErr } = await sb
        .from('profiles')
        .update(patch)
        .eq('id', body.id)
        .select()
        .single()
      if (pErr) throw pErr

      // * When deactivating, also ban the auth user so the session can't be reused.
      if (body.active === false) {
        await sb.auth.admin.updateUserById(body.id, { ban_duration: '876000h' }).catch(() => {})
      } else if (body.active === true) {
        await sb.auth.admin.updateUserById(body.id, { ban_duration: 'none' }).catch(() => {})
      }

      return jsonResponse({ user: profile })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: current, error: cErr } = await sb
        .from('profiles')
        .select('id, role, active')
        .eq('id', id)
        .single()
      if (cErr) throw cErr

      // * Authorization rules:
      // * - Employees: any admin may delete them.
      // * - Admins: an admin may delete ONLY their own account (the front-end
      // *   re-authenticates with password / 2FA first). Deleting another
      // *   admin is forbidden.
      if (current.role === 'admin') {
        if (current.id !== guard.id) {
          return jsonResponse({ error: 'cannot_delete_admin' }, { status: 403 })
        }
        const adminCount = await countActiveAdmins(sb)
        if (adminCount <= 1) return jsonResponse({ error: 'last_admin' }, { status: 409 })
      }

      // * Hard delete — remove the auth user. profiles.id cascades, and the
      // * created_by/sent_by references are ON DELETE SET NULL, so the account
      // * is fully removed while historical records survive.
      const { error: delErr } = await sb.auth.admin.deleteUser(id)
      if (delErr) throw delErr

      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-users]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
