<script setup lang="ts">
// * Shared layout for the static legal pages (mentions légales, CGV, privacy).
// * Ink banner header + a styled prose body fed via the default slot.
defineProps<{ title: string }>()
const { t } = useI18n()
</script>

<template>
  <div class="bg-page dark:bg-sidebar-bg min-h-[70vh]">
    <section class="bg-ink text-white px-6 md:px-12 py-12 md:py-14">
      <div class="max-w-4xl mx-auto">
        <NuxtLink
          to="/"
          class="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-medium mb-4 transition-colors"
        >
          <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
          {{ t('nav.home') }}
        </NuxtLink>
        <h1 class="font-heading text-3xl md:text-[40px] font-extrabold uppercase leading-none">
          {{ title }}
        </h1>
      </div>
    </section>

    <section class="max-w-4xl mx-auto px-6 md:px-12 py-10 md:py-12">
      <div class="legal-body">
        <slot />
      </div>
    </section>
  </div>
</template>

<style scoped>
.legal-body :deep(h2) {
  font-family: var(--font-heading);
  font-weight: 800;
  font-size: 1.2rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--color-ink);
  margin: 1.75rem 0 0.5rem;
}
.legal-body :deep(p) {
  color: #555;
  line-height: 1.7;
  margin-bottom: 0.85rem;
  font-size: 0.95rem;
}
.legal-body :deep(ul) {
  list-style: disc;
  padding-left: 1.25rem;
  margin-bottom: 0.85rem;
  color: #555;
}
.legal-body :deep(li) {
  margin-bottom: 0.35rem;
}
:where(.dark) .legal-body :deep(h2) {
  color: #ffffff;
}
:where(.dark) .legal-body :deep(p),
:where(.dark) .legal-body :deep(ul) {
  color: #cbd5e1;
}
</style>
