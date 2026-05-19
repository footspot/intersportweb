// * Any authenticated user (admin or employee). The storefront has no
// * customer login; this guard only protects back-office routes.
import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const auth = useAuthStore()
  if (!auth.profile) await auth.fetchProfile()
  if (!auth.profile) return navigateTo('/admin/login')
})
