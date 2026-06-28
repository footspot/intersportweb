// * Customer favorites store — the signed-in user's saved product ids.
// * Reads/writes the RLS-protected `favorites` table directly via supabase-js
// * (each row is pinned to auth.uid(), so a user only ever touches their own).
// * Also owns the global login-prompt modal state, opened when a guest taps the
// * heart on a product card.
import { defineStore } from 'pinia'

export const useFavoritesStore = defineStore('favorites', () => {
  // * Favorited product ids for the current user. Empty for guests.
  const ids = ref<Set<string>>(new Set())
  const loaded = ref(false)
  // * Shown when a logged-out visitor tries to favorite something.
  const promptOpen = ref(false)

  const count = computed(() => ids.value.size)
  function isFavorite(productId: string) {
    return ids.value.has(productId)
  }

  async function load() {
    const user = useSupabaseUser()
    if (!user.value) {
      ids.value = new Set()
      loaded.value = true
      return
    }
    const client = useSupabaseClient()
    const { data, error } = await client.from('favorites').select('product_id')
    if (error) {
      console.error('[favorites] load failed', error)
      return
    }
    ids.value = new Set((data ?? []).map((r: { product_id: string }) => r.product_id))
    loaded.value = true
  }

  // * Optimistic add — flip the UI first, roll back if the write fails.
  async function add(productId: string) {
    const next = new Set(ids.value)
    next.add(productId)
    ids.value = next
    const client = useSupabaseClient()
    const { error } = await client.from('favorites').insert({ product_id: productId })
    if (error) {
      const rollback = new Set(ids.value)
      rollback.delete(productId)
      ids.value = rollback
      throw error
    }
  }

  async function remove(productId: string) {
    const next = new Set(ids.value)
    next.delete(productId)
    ids.value = next
    const client = useSupabaseClient()
    const { error } = await client.from('favorites').delete().eq('product_id', productId)
    if (error) {
      const rollback = new Set(ids.value)
      rollback.add(productId)
      ids.value = rollback
      throw error
    }
  }

  async function toggle(productId: string) {
    return isFavorite(productId) ? remove(productId) : add(productId)
  }

  // * Called on sign-out — drop everything so the next user starts clean.
  function clear() {
    ids.value = new Set()
    loaded.value = false
  }

  function openPrompt() {
    promptOpen.value = true
  }
  function closePrompt() {
    promptOpen.value = false
  }

  return {
    ids,
    loaded,
    promptOpen,
    count,
    isFavorite,
    load,
    add,
    remove,
    toggle,
    clear,
    openPrompt,
    closePrompt,
  }
})
