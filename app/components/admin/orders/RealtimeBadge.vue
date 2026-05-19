<script setup lang="ts">
// * Tiny indicator that shows the realtime feed is live (pulsing green dot).
const { t } = useI18n()
</script>

<template>
  <div class="inline-flex items-center gap-2 text-xs text-gray-500">
    <span class="relative flex h-2 w-2">
      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-60"></span>
      <span class="relative inline-flex rounded-full h-2 w-2 bg-brand-green"></span>
    </span>
    <span>{{ t('admin.orders.realtime') }}</span>
  </div>
</template>
