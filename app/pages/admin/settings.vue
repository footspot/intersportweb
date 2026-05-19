<script setup lang="ts">
// * /admin/settings — stub. App-wide settings (shipping cost, flat rate, etc.)
// * will land here when the client needs them.
definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })
const { t } = useI18n()
</script>

<template>
  <div class="max-w-2xl space-y-4">
    <div>
      <h1 class="font-heading text-2xl font-bold">{{ t('admin.settings.title') }}</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.settings.subtitle') }}</p>
    </div>
    <div class="p-8 text-center bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm">
      <UIcon name="i-lucide-settings" class="w-10 h-10 mx-auto text-gray-300 mb-2" />
      <p class="text-gray-500">{{ t('admin.settings.comingSoon') }}</p>
    </div>
  </div>
</template>
