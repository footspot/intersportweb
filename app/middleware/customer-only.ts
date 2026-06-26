// * Storefront account pages (order history). Any signed-in user may view
// * their own history — this guard only requires a session, bouncing guests to
// * the passwordless login. Back-office users are allowed through too: the page
// * keys off their email like anyone else, so it stays harmless.
import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const auth = useAuthStore()
  if (!auth.profile) await auth.fetchProfile()
  if (!auth.profile) return navigateTo('/account/login')
})
