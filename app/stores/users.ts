// * Users store — admin/employee accounts only. Customers are not listed here.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export type Role = 'admin' | 'employee'

export interface User {
  id: string
  email: string
  full_name: string | null
  role: Role
  active: boolean
  created_at: string
}

interface UserState {
  items: User[]
  loading: boolean
  error: string | null
  lastCreated: { password?: string; link?: string | null } | null
}

export const useUsersStore = defineStore('users', {
  state: (): UserState => ({
    items: [],
    loading: false,
    error: null,
    lastCreated: null,
  }),

  getters: {
    admins: (state) => state.items.filter((u) => u.role === 'admin' && u.active),
    employees: (state) => state.items.filter((u) => u.role === 'employee' && u.active),
    inactive: (state) => state.items.filter((u) => !u.active),
  },

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const client = useSupabaseClient()
        const { data, error } = await client
          .from('profiles')
          .select('id, email, full_name, role, active, created_at')
          .in('role', ['admin', 'employee'])
          .order('created_at', { ascending: false })
        if (error) throw error
        this.items = (data ?? []) as User[]
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load users'
      } finally {
        this.loading = false
      }
    },

    async create(payload: {
      email: string
      full_name?: string
      role: Role
      active?: boolean
      password?: string
    }) {
      const { data, error } = await invokeEdge<{
        user: User
        temporary_password?: string
        login_link?: string | null
      }>('admin-users', { method: 'POST', body: payload })
      if (error) throw new Error(error.message)
      if (data?.user) {
        this.items.unshift(data.user)
        this.lastCreated = { password: data.temporary_password, link: data.login_link }
      }
      return data
    },

    async update(payload: { id: string; full_name?: string; role?: Role; active?: boolean }) {
      const { data, error } = await invokeEdge<{ user: User }>('admin-users', {
        method: 'PUT',
        body: payload,
      })
      if (error) throw new Error(error.message)
      const updated = data?.user
      if (updated) {
        const idx = this.items.findIndex((u) => u.id === updated.id)
        if (idx !== -1) this.items[idx] = updated
      }
      return updated
    },

    async remove(id: string) {
      const { error } = await invokeEdge<{ ok: true }>('admin-users', {
        method: 'DELETE',
        query: { id },
      })
      if (error) throw error
      const u = this.items.find((x) => x.id === id)
      if (u) u.active = false
    },

    clearLastCreated() {
      this.lastCreated = null
    },
  },
})
