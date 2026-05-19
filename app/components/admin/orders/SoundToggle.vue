<script setup lang="ts">
// * Mute button + volume slider for the back-office order beep.
import { useUiSoundStore } from '~/stores/uiSound'
import { useOrderSound } from '~/composables/useOrderSound'

const sound = useUiSoundStore()
const { play } = useOrderSound()
const { t } = useI18n()

const open = ref(false)

function testBeep() {
  play()
}

function toggle() {
  sound.toggle()
  // * Playing a beep the first time the user enables sound also "unlocks"
  // * the AudioContext on browsers that require a user gesture.
  if (sound.enabled) play()
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
      :aria-label="sound.enabled ? t('admin.orders.sound.mute') : t('admin.orders.sound.unmute')"
      @click="open = !open"
    >
      <UIcon :name="sound.enabled ? 'i-lucide-volume-2' : 'i-lucide-volume-x'" class="w-5 h-5" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 mt-2 w-56 p-3 rounded-card shadow-card-lg bg-white dark:bg-sidebar-surface border border-gray-100 dark:border-sidebar z-40 space-y-3"
      @click.stop
    >
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">{{ t('admin.orders.sound.title') }}</span>
        <button
          type="button"
          class="text-xs px-2 py-1 rounded-lg"
          :class="sound.enabled ? 'bg-brand-green/10 text-brand-green' : 'bg-gray-100 dark:bg-sidebar text-gray-500'"
          @click="toggle"
        >
          {{ sound.enabled ? t('admin.orders.sound.on') : t('admin.orders.sound.off') }}
        </button>
      </div>

      <div>
        <label class="text-xs text-gray-500">{{ t('admin.orders.sound.volume') }}</label>
        <input
          :value="sound.volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          class="w-full accent-brand-primary"
          @input="(e) => (sound.volume = Number((e.target as HTMLInputElement).value))"
        />
      </div>

      <button
        type="button"
        class="w-full text-xs py-1.5 rounded-lg bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20"
        :disabled="!sound.enabled"
        @click="testBeep"
      >
        {{ t('admin.orders.sound.test') }}
      </button>
    </div>
  </div>
</template>
