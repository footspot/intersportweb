// * Admin-only pages (Sports, Clubs, Users, Catalog, Contact, Stats, Settings, Fund).
import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const auth = useAuthStore()
  if (!auth.profile) await auth.fetchProfile()

  if (!auth.profile) {
    return navigateTo('/admin/login')
  }
  if (!auth.isAdmin) {
    return abortNavigation({ statusCode: 403, message: 'Admin access required' })
  }
})
