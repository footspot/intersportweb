<script setup lang="ts">
interface Kpi {
  label: string
  value: string
  hint?: string
  accent?: 'primary' | 'green' | 'purple' | 'gold'
}
defineProps<{ kpis: Kpi[] }>()

const ACCENT: Record<NonNullable<Kpi['accent']>, string> = {
  primary: 'text-brand-primary',
  green: 'text-brand-green',
  purple: 'text-brand-purple',
  gold: 'text-brand-gold',
}
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
    <div
      v-for="(k, i) in kpis"
      :key="i"
      class="p-4 rounded-card bg-white dark:bg-sidebar-surface shadow-card-sm"
    >
      <div class="text-xs uppercase tracking-wider text-gray-500">{{ k.label }}</div>
      <div class="font-heading text-2xl font-bold" :class="ACCENT[k.accent ?? 'primary']">{{ k.value }}</div>
      <div v-if="k.hint" class="text-xs text-gray-500">{{ k.hint }}</div>
    </div>
  </div>
</template>
