<script setup lang="ts">
// * Horizontal bar list: qty sold per size. Sorted by qty desc.
interface SizeRow {
  size: string
  qty: number
}
const props = defineProps<{ data: SizeRow[] }>()
const { t } = useI18n()

const max = computed(() => Math.max(1, ...props.data.map((d) => d.qty)))
</script>

<template>
  <div>
    <h4 class="font-heading font-bold mb-2">{{ t('admin.stats.sizeBreakdown') }}</h4>
    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4">
      <div v-if="data.length === 0" class="py-12 text-center text-sm text-gray-500">
        {{ t('admin.stats.noData') }}
      </div>
      <ul v-else class="space-y-2">
        <li v-for="r in data" :key="r.size" class="flex items-center gap-3 text-sm">
          <span class="font-mono font-medium w-10 shrink-0">{{ r.size }}</span>
          <div class="flex-1 h-4 bg-gray-100 dark:bg-sidebar rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-brand-primary to-brand-primary-light"
              :style="{ width: `${(r.qty / max) * 100}%` }"
            />
          </div>
          <span class="tabular-nums text-gray-500 w-10 text-right">{{ r.qty }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
