// * Auth store — exposes user, profile (with role), and role helpers.
// * Keep this the single source of truth for role checks in the UI.
import { defineStore } from 'pinia'

export type UserRole = 'admin' | 'employee' | 'customer'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  active: boolean
  created_at: string
}

interface AuthState {
  profile: Profile | null
  loadingProfile: boolean
  // * In-flight fetchProfile() promise, used to dedupe concurrent calls
  // * (plugin boot + route middleware fire it at the same time). Sharing one
  // * promise avoids two parallel auth-lock acquisitions that deadlock/steal.
  _profilePromise: Promise<void> | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    profile: null,
    loadingProfile: false,
    _profilePromise: null,
  }),

  getters: {
    isAuthenticated(): boolean {
      const user = useSupabaseUser()
      return !!user.value
    },
    role(): UserRole | null {
      return this.profile?.role ?? null
    },
    isAdmin(): boolean {
      return this.profile?.role === 'admin'
    },
    isEmployee(): boolean {
      return this.profile?.role === 'employee'
    },
    isBackoffice(): boolean {
      return this.profile?.role === 'admin' || this.profile?.role === 'employee'
    },
    // * Storefront self-service account. No back-office access — purely an
    // * order-history surface (see middleware/customer-only.ts).
    isCustomer(): boolean {
      return this.profile?.role === 'customer'
    },
  },

  actions: {
    fetchProfile(): Promise<void> {
      // * Dedupe: if a fetch is already running, reuse its promise instead of
      // * starting a second one. Two concurrent runs each grab the gotrue auth
      // * lock and one waits >5s before the other "steals" it — the errors we
      // * were seeing. One shared promise = one lock acquisition.
      if (this._profilePromise) return this._profilePromise
      this._profilePromise = this._doFetchProfile().finally(() => {
        this._profilePromise = null
      })
      return this._profilePromise
    },

    async _doFetchProfile() {
      // * Read the uid from getSession() (local-storage read, fast) rather than
      // * getUser() (a network round-trip that holds the auth lock the whole
      // * time). The reactive useSupabaseUser() ref is sometimes empty right
      // * after sign-in, but the persisted session is reliable here.
      // * IMPORTANT: don't clobber the existing profile on transient failures
      // * (network hiccup, token-refresh in flight). Only explicit sign-out
      // * clears it via signOut() / the SIGNED_OUT auth event.
      const client = useSupabaseClient()
      this.loadingProfile = true
      try {
        const { data: sessionData } = await client.auth.getSession()
        const uid = sessionData?.session?.user?.id
        if (!uid) {
          // * No session. If we never had a profile, keep it null. If we did,
          // * leave it in place until the next definitive sign-out — this
          // * prevents admin UI flicker during transient auth hiccups.
          return
        }
        const { data, error } = await client
          .from('profiles')
          .select('id, email, full_name, role, active, created_at')
          .eq('id', uid)
          .single()
        if (error) throw error
        this.profile = data as Profile
      } catch (err) {
        console.error('[auth] fetchProfile failed', err)
        // * keep existing profile; swallow transient errors
      } finally {
        this.loadingProfile = false
      }
    },

    // * True when the caller has a verified 2FA factor but the current session
    // * is still at AAL1 — i.e. they signed in with a password but have not yet
    // * entered their authenticator code. Back-office middleware uses this to
    // * bounce them to /admin/login, where the MFA challenge step resumes.
    async needsMfa(): Promise<boolean> {
      const client = useSupabaseClient()
      try {
        const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
        return data?.currentLevel === 'aal1' && data?.nextLevel === 'aal2'
      } catch {
        return false
      }
    },

    async signOut() {
      const client = useSupabaseClient()
      // * Route by role BEFORE clearing the profile: back-office users return to
      // * the admin login, storefront customers to the public home.
      const wasBackoffice = this.profile?.role === 'admin' || this.profile?.role === 'employee'
      await client.auth.signOut()
      this.profile = null
      await navigateTo(wasBackoffice ? '/admin/login' : '/')
    },
  },
})
