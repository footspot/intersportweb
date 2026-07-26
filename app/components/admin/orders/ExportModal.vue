<script setup lang="ts">
// * Bulk export modal — builds a zip with one folder per selected order
// * containing its bon de commande and, for paid-and-beyond statuses, its
// * facture. The list is the already-filtered orders from the page; everything
// * is selected by default and can be unticked one by one.
import JSZip from 'jszip'
import type { Order, OrderStatus } from '~/stores/orders'
import { invokeEdge } from '~/composables/useEdgeFunction'

interface Props {
  modelValue: boolean
  orders: Order[]
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
}>()

const { t } = useI18n()

// * Statuses that have a customer invoice — pending/cancelled orders only get
// * their internal purchase order in the zip.
const INVOICE_STATUSES: OrderStatus[] = [
  'paid',
  'partially_refunded',
  'shipped',
  'awaiting_pickup',
  'picked_up',
  'delivered',
  'refunded',
]

const selected = ref<Record<string, boolean>>({})
const running = ref(false)
const progress = reactive({ done: 0, total: 0 })
const errors = ref<string[]>([])

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    selected.value = Object.fromEntries(props.orders.map((o) => [o.id, true]))
    errors.value = []
    progress.done = 0
    progress.total = 0
  },
  { immediate: true },
)

const selectedCount = computed(() => props.orders.filter((o) => selected.value[o.id]).length)
const allSelected = computed({
  get: () => props.orders.length > 0 && selectedCount.value === props.orders.length,
  set: (v: boolean) => {
    selected.value = Object.fromEntries(props.orders.map((o) => [o.id, v]))
  },
})

function fmt(v: number | string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' })
}

function close() {
  if (!running.value) emit('update:modelValue', false)
}

async function fetchPdf(fn: string, order: Order): Promise<Uint8Array> {
  const { data, error } = await invokeEdge<{ signed_url: string }>(fn, {
    method: 'POST',
    body: { order_id: order.id, locale: 'fr' },
  })
  if (error || !data?.signed_url) throw new Error(error?.message ?? 'no signed url')
  const res = await fetch(data.signed_url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

// * One folder per order; failures are collected per order and the zip still
// * ships with everything that succeeded.
async function addOrder(zip: JSZip, order: Order) {
  try {
    const po = await fetchPdf('generate-purchase-order', order)
    zip.file(`${order.order_number}/bon-de-commande-${order.order_number}.pdf`, po)
    if (INVOICE_STATUSES.includes(order.status)) {
      const inv = await fetchPdf('generate-invoice', order)
      zip.file(`${order.order_number}/facture-${order.order_number}.pdf`, inv)
    }
  } catch {
    errors.value.push(order.order_number)
  }
}

async function exportZip() {
  const picked = props.orders.filter((o) => selected.value[o.id])
  if (!picked.length || running.value) return
  running.value = true
  errors.value = []
  progress.done = 0
  progress.total = picked.length

  try {
    const zip = new JSZip()
    const queue = [...picked]
    const worker = async () => {
      for (let o = queue.shift(); o; o = queue.shift()) {
        await addOrder(zip, o)
        progress.done++
      }
    }
    await Promise.all(Array.from({ length: 3 }, worker))

    if (Object.keys(zip.files).length) {
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const day = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `commandes-${day}.zip`
      a.click()
      URL.revokeObjectURL(url)
      if (!errors.value.length) emit('update:modelValue', false)
    }
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-2xl bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4 max-h-[90vh] flex flex-col">
      <div>
        <h3 class="font-heading text-lg font-bold">{{ t('admin.orders.export.title') }}</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.orders.export.subtitle') }}</p>
      </div>

      <div v-if="orders.length === 0" class="text-sm text-gray-500 p-3 bg-gray-50 dark:bg-sidebar rounded-lg">
        {{ t('admin.orders.export.empty') }}
      </div>

      <template v-else>
        <label class="flex items-center gap-2 text-sm font-medium border-b border-gray-100 dark:border-sidebar pb-2">
          <input v-model="allSelected" type="checkbox" class="w-4 h-4 accent-brand-primary" :disabled="running" />
          <span>{{ t('admin.orders.export.selectAll') }}</span>
          <span class="ml-auto text-xs text-gray-500">
            {{ t('admin.orders.export.selected', { n: selectedCount, total: orders.length }) }}
          </span>
        </label>

        <div class="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
          <label
            v-for="o in orders"
            :key="o.id"
            class="flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer"
            :class="selected[o.id] ? 'bg-brand-primary/5 border-brand-primary/40' : 'border-gray-200 dark:border-sidebar'"
          >
            <input
              type="checkbox"
              :checked="!!selected[o.id]"
              class="w-4 h-4 accent-brand-primary shrink-0"
              :disabled="running"
              @change="(e) => (selected[o.id] = (e.target as HTMLInputElement).checked)"
            />
            <div class="flex-1 min-w-0">
              <span class="font-medium text-sm">{{ o.order_number }}</span>
              <span class="text-xs text-gray-500 ml-2 truncate">
                {{ [o.guest_first_name, o.guest_last_name].filter(Boolean).join(' ') }}
              </span>
            </div>
            <span class="text-xs text-gray-500 shrink-0">{{ fmtDate(o.created_at) }}</span>
            <span class="text-xs text-gray-500 shrink-0 w-16 text-right">{{ fmt(o.total) }}</span>
            <span class="text-[10px] uppercase tracking-wide text-gray-400 shrink-0 w-24 text-right">
              {{ t(`admin.orders.status.${o.status}`) }}
            </span>
          </label>
        </div>

        <p class="text-xs text-gray-500">{{ t('admin.orders.export.invoiceNote') }}</p>

        <div v-if="running" class="space-y-1">
          <div class="h-1.5 rounded-full bg-gray-100 dark:bg-sidebar overflow-hidden">
            <div
              class="h-full bg-brand-primary transition-all"
              :style="{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }"
            />
          </div>
          <p class="text-xs text-gray-500">
            {{ t('admin.orders.export.progress', { done: progress.done, total: progress.total }) }}
          </p>
        </div>

        <p v-if="errors.length" class="text-sm text-brand-secondary">
          {{ t('admin.orders.export.failed', { orders: errors.join(', ') }) }}
        </p>

        <div class="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-sidebar">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
            :disabled="running"
            @click="close"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
            :disabled="running || selectedCount === 0"
            @click="exportZip"
          >
            <UIcon name="i-lucide-download" class="w-4 h-4" />
            {{ running ? t('common.loading') : t('admin.orders.export.confirm', { n: selectedCount }) }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
