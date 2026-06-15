<script setup lang="ts">
// * Manual refund modal. Lists OK lines (already-refunded lines are shown
// * disabled), lets the admin pick which to refund, optional restock toggle.
import type { Order, OrderItem } from '~/stores/orders'
import { useOrdersStore } from '~/stores/orders'

interface Props {
  modelValue: boolean
  order: Order | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'refunded'): void
}>()

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const orders = useOrdersStore()

const selected = ref<Record<string, boolean>>({})
const restock = ref(true)
const reason = ref('')
const saving = ref(false)
const errorMsg = ref<string | null>(null)

const detail = ref<Order | null>(null)

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    selected.value = {}
    restock.value = true
    reason.value = ''
    errorMsg.value = null
    if (props.order) {
      detail.value = await orders.fetchDetail(props.order.id)
    }
  },
  { immediate: true },
)

const refundableItems = computed<OrderItem[]>(() =>
  (detail.value?.items ?? []).filter((i) => i.status === 'ok'),
)

const totalRefund = computed(() =>
  refundableItems.value
    .filter((i) => selected.value[i.id])
    .reduce((sum, i) => sum + Number(i.unit_price_paid) * i.quantity, 0),
)

function fmt(v: number | string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function submit() {
  if (!props.order) return
  const itemIds = refundableItems.value.filter((i) => selected.value[i.id]).map((i) => i.id)
  if (itemIds.length === 0) {
    errorMsg.value = t('admin.orders.refund.selectSomething')
    return
  }
  errorMsg.value = null
  saving.value = true
  try {
    await orders.refundLines(props.order.id, itemIds, {
      restock: restock.value,
      reason: reason.value.trim() || undefined,
    })
    emit('refunded')
    emit('update:modelValue', false)
  } catch (err) {
    const e = err as Error & { code?: string; detail?: { detail?: string } }
    const lyraDetail = String(e?.detail?.detail ?? '')
    if (e?.code === 'lyra_refund_failed' && /rest api option not enabled/i.test(lyraDetail)) {
      errorMsg.value = t('admin.orders.refund.errorLyraNotEnabled')
    } else {
      errorMsg.value = edgeErrorMessage(err)
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-lg bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
      <h3 class="font-heading text-lg font-bold">
        {{ t('admin.orders.refund.title', { n: order?.order_number ?? '' }) }}
      </h3>

      <div v-if="!detail" class="text-sm text-gray-500">{{ t('common.loading') }}</div>

      <template v-else>
        <div v-if="refundableItems.length === 0" class="text-sm text-gray-500 p-3 bg-gray-50 dark:bg-sidebar rounded-lg">
          {{ t('admin.orders.refund.nothingRefundable') }}
        </div>
        <div v-else class="space-y-2">
          <label
            v-for="item in refundableItems"
            :key="item.id"
            class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-sidebar cursor-pointer"
            :class="selected[item.id] ? 'bg-brand-primary/5 border-brand-primary/40' : ''"
          >
            <input
              type="checkbox"
              :checked="!!selected[item.id]"
              class="mt-1 w-4 h-4 accent-brand-primary"
              @change="(e) => (selected[item.id] = (e.target as HTMLInputElement).checked)"
            />
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">
                {{ item.product?.name.fr ?? item.product_id }}
              </div>
              <div class="text-xs text-gray-500">
                {{ t('admin.orders.refund.size') }}: {{ item.size }} · ×{{ item.quantity }} ·
                {{ fmt(Number(item.unit_price_paid) * item.quantity) }}
              </div>
            </div>
          </label>

          <label class="flex items-center gap-2 text-sm pt-2">
            <input v-model="restock" type="checkbox" class="w-4 h-4 accent-brand-primary" />
            <span>{{ t('admin.orders.refund.restock') }}</span>
          </label>

          <label class="block">
            <span class="text-sm font-medium">{{ t('admin.orders.refund.reason') }}</span>
            <input
              v-model="reason"
              type="text"
              class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
              :placeholder="t('admin.orders.refund.reasonPlaceholder')"
            />
          </label>

          <div class="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-sidebar">
            <span class="text-sm text-gray-500">{{ t('admin.orders.refund.total') }}</span>
            <span class="font-heading text-lg font-bold text-brand-secondary">{{ fmt(totalRefund) }}</span>
          </div>
        </div>
      </template>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
          :disabled="saving"
          @click="close"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-secondary text-white hover:opacity-90 disabled:opacity-60"
          :disabled="saving || totalRefund <= 0"
          @click="submit"
        >
          {{ saving ? t('common.loading') : t('admin.orders.refund.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>
