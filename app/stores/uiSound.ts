// * Sound preferences for the back-office order beep. Persisted via localStorage
// * through VueUse so the setting survives reloads.
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'

interface UiSoundState {
  enabled: boolean
  volume: number           // * 0..1
}

const STORAGE_KEY = 'intersport:ui-sound'

export const useUiSoundStore = defineStore('uiSound', () => {
  const state = useStorage<UiSoundState>(STORAGE_KEY, {
    enabled: true,
    volume: 0.6,
  })

  const enabled = computed({
    get: () => state.value.enabled,
    set: (v) => {
      state.value = { ...state.value, enabled: v }
    },
  })

  const volume = computed({
    get: () => state.value.volume,
    set: (v) => {
      const next = Math.max(0, Math.min(1, Number(v) || 0))
      state.value = { ...state.value, volume: next }
    },
  })

  function toggle() {
    enabled.value = !enabled.value
  }

  return { enabled, volume, toggle }
})
