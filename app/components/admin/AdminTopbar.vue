<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()
const colorMode = useColorMode()
const { t, locale, locales, setLocale } = useI18n()

const logoutOpen = ref(false)
const logoutBusy = ref(false)

function toggleDark() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

function swapLocale() {
  const next = locale.value === 'fr' ? 'en' : 'fr'
  setLocale(next)
}

async function doLogout() {
  logoutBusy.value = true
  try {
    await auth.signOut()
    logoutOpen.value = false
  } finally {
    logoutBusy.value = false
  }
}
</script>

<template>
  <header class="h-16 bg-white dark:bg-sidebar-surface border-b border-gray-200 dark:border-sidebar px-6 flex items-center justify-between">
    <div class="text-sm text-gray-500">
      <!-- * Search will land here in a later phase -->
    </div>

    <div class="flex items-center gap-3">
      <div class="flex items-center gap-1">
        <AdminOrdersSoundToggle />

        <AdminNotificationsBell />

        <button
          type="button"
          class="w-9 h-9 inline-flex items-center justify-center rounded-lg text-sm font-semibold hover:bg-gray-100 dark:hover:bg-sidebar"
          :aria-label="`Switch language (${locale.toUpperCase()})`"
          @click="swapLocale"
        >
          {{ locale.toUpperCase() }}
        </button>

        <button
          type="button"
          class="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
          aria-label="Toggle dark mode"
          @click="toggleDark"
        >
          <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-5 h-5" />
        </button>
      </div>

      <div class="h-8 w-px bg-gray-200 dark:bg-sidebar mx-1" />

      <ClientOnly>
        <div class="text-sm">
          <div class="font-medium">{{ auth.profile?.full_name || auth.profile?.email }}</div>
          <div class="text-xs text-gray-500 capitalize">{{ auth.role }}</div>
        </div>
      </ClientOnly>

      <button
        type="button"
        class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
        aria-label="Sign out"
        @click="logoutOpen = true"
      >
        <UIcon name="i-lucide-log-out" class="w-5 h-5" />
      </button>
    </div>

    <AdminConfirmDialog
      v-model="logoutOpen"
      :title="t('auth.logoutConfirm.title')"
      :message="t('auth.logoutConfirm.message')"
      :confirm-label="t('auth.logoutConfirm.button')"
      :busy="logoutBusy"
      :danger="false"
      @confirm="doLogout"
    />
  </header>
</template>
