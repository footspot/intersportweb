// * Back-office pages reachable by admin OR employee (Products, Orders).
import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const auth = useAuthStore()
  if (!auth.profile) await auth.fetchProfile()

  if (!auth.profile) {
    return navigateTo('/admin/login')
  }
  // * 2FA enrolled but not yet challenged → finish sign-in first.
  if (await auth.needsMfa()) {
    return navigateTo('/admin/login')
  }
  if (!auth.isBackoffice) {
    return abortNavigation({ statusCode: 403, message: 'Back-office access required' })
  }
})
