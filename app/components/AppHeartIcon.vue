<script setup lang="ts">
// * Heart icon that ACTUALLY fills when checked. Nuxt Icon renders lucide in
// * CSS-mask mode, where `fill-current` is a no-op (an outline icon stays an
// * outline), so we draw the heart inline instead: `filled` swaps the SVG fill
// * to currentColor for a solid heart, otherwise it's the lucide outline.
// * Colour comes from the parent's text colour (currentColor); size via w-/h-.
defineProps<{ filled?: boolean }>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
  </svg>
</template>
