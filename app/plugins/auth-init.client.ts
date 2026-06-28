// * Load the profile for the current Supabase user on app boot and
// * refetch whenever auth state changes.
// * We rely on Supabase's auth events (SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT
// * / INITIAL_SESSION) rather than watching the useSupabaseUser() ref — the
// * ref can go briefly null during navigation, which would flicker the sidebar.
import { useAuthStore } from '~/stores/auth'
import { useFavoritesStore } from '~/stores/favorites'

export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  const favorites = useFavoritesStore()
  const user = useSupabaseUser()
  const client = useSupabaseClient()

  if (user.value?.id && !auth.profile) auth.fetchProfile()
  if (user.value?.id) favorites.load()

  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      if (session?.user?.id) {
        auth.fetchProfile()
        // * Sync the user's saved products once a session is established.
        if (!favorites.loaded) favorites.load()
      }
    }
    if (event === 'SIGNED_OUT') {
      auth.profile = null
      favorites.clear()
    }
  })
})
