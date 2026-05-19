// * Auth store — exposes user, profile (with role), and role helpers.
// * Keep this the single source of truth for role checks in the UI.
import { defineStore } from 'pinia'

export type UserRole = 'admin' | 'employee'

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
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    profile: null,
    loadingProfile: false,
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
  },

  actions: {
    async fetchProfile() {
      // * Read the uid from getUser() — the reactive useSupabaseUser() ref is
      // * sometimes empty right after sign-in or during SSR, even when the
      // * session is valid.
      // * IMPORTANT: don't clobber the existing profile on transient failures
      // * (network hiccup, token-refresh in flight). Only explicit sign-out
      // * clears it via signOut() / the SIGNED_OUT auth event.
      const client = useSupabaseClient()
      this.loadingProfile = true
      try {
        const { data: userData, error: userErr } = await client.auth.getUser()
        const uid = userData?.user?.id
        if (userErr || !uid) {
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

    async signOut() {
      const client = useSupabaseClient()
      await client.auth.signOut()
      this.profile = null
      await navigateTo('/admin/login')
    },
  },
})
