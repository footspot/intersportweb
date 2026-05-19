<script setup lang="ts">
const { t } = useI18n()
const year = new Date().getFullYear()
</script>

<template>
  <footer class="border-t border-gray-200 dark:border-sidebar-surface py-6 text-sm text-gray-500 dark:text-gray-400">
    <div class="max-w-7xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
      <span>© {{ year }} {{ t('app.name') }}</span>
      <div class="flex gap-4">
        <NuxtLink to="/?step=catalog" class="hover:text-brand-primary">{{ t('nav.catalog') }}</NuxtLink>
        <NuxtLink to="/contact" class="hover:text-brand-primary">{{ t('nav.contact') }}</NuxtLink>
      </div>
    </div>
  </footer>
</template>
