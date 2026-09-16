<script setup lang="ts">
// * Codes inside one batch with who used each one. Clicking a code hands it
// * to the page's CodeLookup for the full order history.
import { usePromoCodesStore, type PromoBatch, type PromoCode } from '~/stores/promoCodes'

interface Props {
  modelValue: boolean
  batch: PromoBatch | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'check', code: string): void
}>()

const { t } = useI18n()
const promo = usePromoCodesStore()

const codes = ref<PromoCode[]>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const filter = ref<'all' | 'used' | 'unused'>('all')
const search = ref('')

watch(
  () => [props.modelValue, props.batch?.batch_id],
  async () => {
    if (!props.modelValue || !props.batch) return
    loading.value = true
    errorMsg.value = null
    filter.value = 'all'
    search.value = ''
    try {
      codes.value = await promo.fetchBatchCodes(props.batch.batch_id)
    } catch {
      codes.value = []
      errorMsg.value = t('admin.promo.lookup.failed')
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return codes.value.filter((c) => {
    if (filter.value === 'used' && !c.used_at) return false
    if (filter.value === 'unused' && c.used_at) return false
    if (!q) return true
    return c.code.toLowerCase().includes(q) || (c.used_by_email ?? '').toLowerCase().includes(q)
  })
})
const usedCount = computed(() => codes.value.filter((c) => c.used_at).length)

function close() {
  emit('update:modelValue', false)
}
function check(code: string) {
  emit('check', code)
  close()
}

function fmtDateTime(v: string | null) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v))
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-3xl bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4 max-h-[90vh] flex flex-col">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-heading text-lg font-bold">
            {{ t('admin.promo.batchCodes.title', { id: batch?.batch_id.slice(0, 8) ?? '' }) }}
          </h3>
          <p v-if="!loading" class="text-sm text-gray-500">
            {{ t('admin.promo.batchCodes.summary', { used: usedCount, total: codes.length }) }}
          </p>
        </div>
        <button type="button" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar" @click="close">
          <UIcon name="i-lucide-x" class="w-4 h-4" />
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <input
          v-model="search"
          type="text"
          class="flex-1 min-w-[12rem] px-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-transparent text-sm"
          :placeholder="t('admin.promo.batchCodes.search')"
        >
        <select
          v-model="filter"
          class="px-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-transparent text-sm"
        >
          <option value="all">{{ t('admin.promo.batchCodes.filterAll') }}</option>
          <option value="used">{{ t('admin.promo.batchCodes.filterUsed') }}</option>
          <option value="unused">{{ t('admin.promo.batchCodes.filterUnused') }}</option>
        </select>
      </div>

      <div class="overflow-auto flex-1 -mx-6 px-6">
        <p v-if="loading" class="py-8 text-center text-gray-500">{{ t('common.loading') }}</p>
        <p v-else-if="errorMsg" class="py-8 text-center text-brand-secondary">{{ errorMsg }}</p>
        <p v-else-if="visible.length === 0" class="py-8 text-center text-gray-500">
          {{ t('admin.promo.batchCodes.empty') }}
        </p>
        <table v-else class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500 sticky top-0">
            <tr>
              <th class="px-3 py-2">{{ t('admin.promo.col.code') }}</th>
              <th class="px-3 py-2">{{ t('admin.promo.batchCodes.usedAt') }}</th>
              <th class="px-3 py-2">{{ t('admin.promo.batchCodes.usedBy') }}</th>
              <th class="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in visible" :key="c.id" class="border-t border-gray-100 dark:border-sidebar">
              <td class="px-3 py-2 font-mono font-medium">{{ c.code }}</td>
              <td class="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                <span v-if="c.used_at">{{ fmtDateTime(c.used_at) }}</span>
                <span v-else class="text-brand-green">{{ t('admin.promo.batchCodes.unused') }}</span>
              </td>
              <td class="px-3 py-2 text-xs">{{ c.used_by_email ?? '—' }}</td>
              <td class="px-3 py-2 text-right">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-xs text-brand-primary hover:underline"
                  @click="check(c.code)"
                >
                  <UIcon name="i-lucide-search-check" class="w-3.5 h-3.5" />
                  {{ t('admin.promo.batchCodes.check') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
