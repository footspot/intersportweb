// * Tracks which password-protected clubs the visitor has unlocked this device.
// * The tokens are HMAC-signed by the club-access edge function and expire in 12h.
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import { invokeEdge } from '~/composables/useEdgeFunction'

interface AccessRecord {
  token: string
  expires_at: number
}

interface AccessState {
  byClub: Record<string, AccessRecord>
}

const STORAGE_KEY = 'intersport:club-access'

export const useClubAccessStore = defineStore('clubAccess', () => {
  const state = useStorage<AccessState>(STORAGE_KEY, { byClub: {} })

  function hasAccess(clubId: string): boolean {
    const rec = state.value.byClub[clubId]
    if (!rec) return false
    if (rec.expires_at < Date.now()) {
      delete state.value.byClub[clubId]
      return false
    }
    return true
  }

  async function unlock(clubId: string, password: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await invokeEdge<{ ok: boolean; token?: string; expires_at?: number; already_public?: boolean }>(
      'club-access',
      { method: 'POST', body: { club_id: clubId, password } },
    )
    if (error) {
      if (error.code === 'invalid_password') return { ok: false, error: 'invalid_password' }
      return { ok: false, error: error.message }
    }
    if (data?.token && data.expires_at) {
      state.value.byClub[clubId] = { token: data.token, expires_at: data.expires_at }
    }
    return { ok: !!data?.ok }
  }

  function forget(clubId: string) {
    delete state.value.byClub[clubId]
  }

  return { hasAccess, unlock, forget }
})
