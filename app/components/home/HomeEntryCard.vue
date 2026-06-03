<script setup lang="ts">
// * One "how can we help you?" card — mockup style: colored top accent bar,
// * icon, title, description and a CTA link. The whole card is clickable.
interface Props {
  accent: string // * hex
  title: string
  desc: string
  cta: string
}
defineProps<Props>()
defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    class="entry-card group relative text-left overflow-hidden rounded-xl border-[1.5px] border-gray-200 dark:border-sidebar-surface bg-white dark:bg-sidebar-surface px-6 py-7 transition-transform duration-150 hover:-translate-y-0.5"
    :style="{ '--accent': accent }"
    @click="$emit('select')"
  >
    <span class="absolute top-0 inset-x-0 h-[3px] rounded-t-xl" :style="{ background: accent }" />

    <div class="mb-3">
      <slot name="icon" />
    </div>

    <div class="font-heading font-extrabold text-xl uppercase tracking-[0.02em] mb-1.5" :style="{ color: accent }">
      {{ title }}
    </div>
    <div class="text-[13px] text-gray-500 dark:text-gray-400 leading-[1.5] mb-4 min-h-[40px] line-clamp-2">
      {{ desc }}
    </div>

    <span class="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.05em]" :style="{ color: accent }">
      {{ cta }}
      <UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
    </span>
  </button>
</template>

<style scoped>
.entry-card:hover {
  border-color: var(--accent);
  box-shadow: 0 12px 28px -12px color-mix(in srgb, var(--accent) 55%, transparent);
}
</style>
