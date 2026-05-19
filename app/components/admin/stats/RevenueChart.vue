<script setup lang="ts">
// * HTML/CSS bar chart: revenue (blue) + margin (green) per bucket. No SVG stretching.
interface Point {
  bucket: string
  revenue: number
  margin: number
}
const props = defineProps<{ series: Point[] }>()
const { t } = useI18n()

const scrollEl = ref<HTMLElement | null>(null)
const isOverflowing = ref(false)

function checkOverflow() {
  const el = scrollEl.value
  if (!el) return
  isOverflowing.value = el.scrollWidth - el.clientWidth > 1
}

onMounted(() => {
  checkOverflow()
  window.addEventListener('resize', checkOverflow)
})
onBeforeUnmount(() => window.removeEventListener('resize', checkOverflow))
watch(() => props.series.length, () => nextTick(checkOverflow))

const max = computed(() => Math.max(1, ...props.series.map((p) => p.revenue)))

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
function shortLabel(b: string) {
  // * YYYY-MM-DD or YYYY-MM → DD/MM or MM/YY
  const parts = b.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`
  return `${parts[1]}/${parts[0].slice(2)}`
}

// * Show every label when buckets are few, thin out for dense series.
const labelStep = computed(() => (props.series.length <= 20 ? 1 : Math.ceil(props.series.length / 12)))

function pct(v: number) {
  return `${Math.max(0, (v / max.value) * 100)}%`
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-2">
      <h4 class="font-heading font-bold">{{ t('admin.stats.revenueChart') }}</h4>
      <div class="flex items-center gap-3 text-xs text-gray-500">
        <span class="inline-flex items-center gap-1">
          <span class="w-2.5 h-2.5 rounded-sm bg-brand-primary" /> {{ t('admin.stats.revenue') }}
        </span>
        <span class="inline-flex items-center gap-1">
          <span class="w-2.5 h-2.5 rounded-sm bg-brand-green" /> {{ t('admin.stats.margin') }}
        </span>
      </div>
    </div>
    <div
      ref="scrollEl"
      class="overflow-x-auto scrollbar-brand bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4"
    >
      <div v-if="series.length === 0" class="py-12 text-center text-sm text-gray-500">
        {{ t('admin.stats.noData') }}
      </div>
      <div v-else :style="{ minWidth: `${series.length * 36}px` }">
        <!-- bars row -->
        <div class="flex items-end gap-1 h-44 border-b border-gray-200 dark:border-sidebar">
          <div
            v-for="p in series"
            :key="p.bucket"
            class="flex-1 h-full flex items-end justify-center gap-0.5"
          >
            <div
              class="relative w-2.5 bg-brand-primary rounded-t-sm transition-all group/rev"
              :style="{ height: pct(p.revenue) }"
            >
              <span
                class="absolute top-0 left-full ml-2 px-1.5 py-0.5 rounded bg-gray-900 text-white text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/rev:opacity-100 transition-opacity pointer-events-none shadow-card-sm z-20"
              >
                {{ fmt(p.revenue) }}
              </span>
            </div>
            <div
              class="relative w-2 bg-brand-green rounded-t-sm transition-all group/mar"
              :style="{ height: pct(Math.max(0, p.margin)) }"
            >
              <span
                class="absolute top-0 left-full ml-2 px-1.5 py-0.5 rounded bg-gray-900 text-white text-[10px] font-medium whitespace-nowrap opacity-0 group-hover/mar:opacity-100 transition-opacity pointer-events-none shadow-card-sm z-20"
              >
                {{ fmt(p.margin) }}
              </span>
            </div>
          </div>
        </div>
        <!-- labels row -->
        <div class="flex gap-1 mt-2">
          <div
            v-for="(p, i) in series"
            :key="`l-${p.bucket}`"
            class="flex-1 text-center text-[11px] text-gray-500"
          >
            <span v-if="i % labelStep === 0">{{ shortLabel(p.bucket) }}</span>
          </div>
        </div>
      </div>
    </div>
    <p
      v-if="isOverflowing"
      class="mt-2 text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1"
    >
      <UIcon name="i-lucide-arrow-big-up" class="w-3.5 h-3.5" />
      {{ t('admin.stats.scrollHint') }}
    </p>
  </div>
</template>
