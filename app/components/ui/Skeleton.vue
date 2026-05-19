<script setup lang="ts">
// * Shimmer skeleton block — use for list/grid loading states so pages don't
// * pop in with a jarring empty container.
interface Props {
  rounded?: 'sm' | 'md' | 'lg' | 'full'
  height?: string
  width?: string
}
withDefaults(defineProps<Props>(), { rounded: 'md', height: '1rem', width: '100%' })
</script>

<template>
  <span
    class="inline-block bg-gray-200 dark:bg-sidebar-surface animate-pulse"
    :class="{
      'rounded-sm': rounded === 'sm',
      'rounded-md': rounded === 'md',
      'rounded-lg': rounded === 'lg',
      'rounded-full': rounded === 'full',
    }"
    :style="{ height, width }"
  />
</template>
