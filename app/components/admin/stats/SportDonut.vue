<script setup lang="ts">
// * SVG donut chart: revenue by sport. Dependency-free.
interface Slice {
  label: string
  value: number
}
const props = defineProps<{ data: Slice[] }>()
const { t } = useI18n()

const PALETTE = [
  '#0331f9', '#e30b0c', '#10b981', '#f59e0b', '#8b5cf6',
  '#3a5fff', '#0ea5e9', '#ec4899', '#14b8a6', '#f97316',
]

const total = computed(() => props.data.reduce((s, d) => s + (d.value || 0), 0))

// * Compute stroke-dasharray segments on a circle with circumference = 100
const segments = computed(() => {
  if (total.value <= 0) return []
  let offset = 25          // * start at 12 o'clock
  return props.data.map((d, i) => {
    const pct = (d.value / total.value) * 100
    const seg = { label: d.label, value: d.value, pct, offset, color: PALETTE[i % PALETTE.length] }
    offset += pct
    return seg
  })
})

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
</script>

<template>
  <div>
    <h4 class="font-heading font-bold mb-2">{{ t('admin.stats.sportDonut') }}</h4>
    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4">
      <div v-if="data.length === 0 || total === 0" class="py-12 text-center text-sm text-gray-500">
        {{ t('admin.stats.noData') }}
      </div>
      <div v-else class="flex flex-col sm:flex-row items-center gap-6">
        <svg viewBox="0 0 42 42" class="w-40 h-40 shrink-0">
          <circle cx="21" cy="21" r="15.9155" fill="transparent" class="stroke-gray-100 dark:stroke-sidebar" stroke-width="5" />
          <circle
            v-for="s in segments"
            :key="s.label"
            cx="21" cy="21" r="15.9155"
            fill="transparent"
            :stroke="s.color"
            stroke-width="5"
            :stroke-dasharray="`${s.pct} ${100 - s.pct}`"
            :stroke-dashoffset="100 - s.offset"
          >
            <title>{{ s.label }} · {{ fmt(s.value) }} · {{ s.pct.toFixed(1) }}%</title>
          </circle>
          <text x="21" y="20" text-anchor="middle" class="fill-gray-500" font-size="3">
            {{ t('admin.stats.total') }}
          </text>
          <text x="21" y="25" text-anchor="middle" class="fill-current font-heading font-bold" font-size="4.2">
            {{ fmt(total) }}
          </text>
        </svg>

        <ul class="space-y-1.5 text-sm flex-1 min-w-0 w-full">
          <li v-for="s in segments" :key="s.label" class="flex items-center justify-between gap-2">
            <span class="inline-flex items-center gap-2 min-w-0">
              <span class="w-3 h-3 rounded-sm shrink-0" :style="{ background: s.color }" />
              <span class="truncate">{{ s.label }}</span>
            </span>
            <span class="tabular-nums text-gray-500 shrink-0">{{ fmt(s.value) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
