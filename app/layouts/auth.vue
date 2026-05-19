<script setup lang="ts">
// * Minimal layout for authentication screens (admin login).
// * Intentionally omits the shop header, cart drawer and sign-up link.
const { t, locale, setLocale } = useI18n()
const colorMode = useColorMode()

function toggleDark() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
function swapLocale() {
  setLocale(locale.value === 'fr' ? 'en' : 'fr')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-white dark:bg-sidebar-bg text-gray-900 dark:text-gray-100">
    <header class="border-b border-gray-200 dark:border-sidebar-surface">
      <div class="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <NuxtLink to="/" class="shrink-0 flex items-center" :aria-label="t('app.name')">
          <img
            src="/logo_compose_noir.svg"
            :alt="t('app.name')"
            class="h-10 w-auto dark:invert"
          >
        </NuxtLink>

        <div class="flex items-center gap-2">
          <button
            type="button"
            class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar-surface text-sm font-medium"
            :aria-label="t('nav.language')"
            @click="swapLocale"
          >
            {{ locale.toUpperCase() }}
          </button>
          <button
            type="button"
            class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar-surface"
            :aria-label="t('nav.toggleDark')"
            @click="toggleDark"
          >
            <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
