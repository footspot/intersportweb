<script setup lang="ts">
import { useOrdersStore, ORDER_TRANSITIONS, type Order, type OrderStatus } from '~/stores/orders'

interface Props {
  orders: Order[]
}
const props = defineProps<Props>()
defineEmits<{
  (e: 'open', o: Order): void
  (e: 'tracking', o: Order): void
  (e: 'refund', o: Order): void
  (e: 'comments', o: Order): void
}>()

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const ordersStore = useOrdersStore()
const toast = useToast()

type SortKey = 'amount' | 'status' | 'date'
type SortDir = 'asc' | 'desc'
const sortKey = ref<SortKey>('date')
const sortDir = ref<SortDir>('desc')

function toggleSort(key: SortKey) {
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = key === 'date' ? 'desc' : 'asc'
  }
}

const sortedOrders = computed<Order[]>(() => {
  const list = (props.orders ?? []).filter(Boolean)
  const dir = sortDir.value === 'asc' ? 1 : -1
  const key = sortKey.value
  return [...list].sort((a, b) => {
    let cmp = 0
    if (key === 'amount') {
      cmp = Number(a.total ?? 0) - Number(b.total ?? 0)
    } else if (key === 'status') {
      cmp = String(a.status ?? '').localeCompare(String(b.status ?? ''))
    } else {
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    }
    return cmp * dir
  })
})

function fmt(v: number | string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  pending: 'bg-brand-gold/10 text-brand-gold',
  paid: 'bg-brand-green/10 text-brand-green',
  partially_refunded: 'bg-brand-purple/10 text-brand-purple',
  shipped: 'bg-brand-primary/10 text-brand-primary',
  awaiting_pickup: 'bg-brand-primary/10 text-brand-primary',
  picked_up: 'bg-gray-200 dark:bg-sidebar text-gray-600 dark:text-gray-300',
  delivered: 'bg-gray-200 dark:bg-sidebar text-gray-600 dark:text-gray-300',
  cancelled: 'bg-brand-secondary/10 text-brand-secondary',
  refunded: 'bg-brand-secondary/10 text-brand-secondary',
  abandoned: 'bg-gray-100 dark:bg-sidebar text-gray-400 dark:text-gray-500',
}

const TRANSITIONS = ORDER_TRANSITIONS

// * The preparation badge only makes sense while the order is still being
// * prepared — once it's sent (or dead), the column goes back to empty.
const PREPARATION_DONE: OrderStatus[] = [
  'shipped',
  'awaiting_pickup',
  'picked_up',
  'delivered',
  'cancelled',
  'refunded',
  'abandoned',
]
function inPreparation(o: Order) {
  return o.preparation_status === 'in_progress' && !PREPARATION_DONE.includes(o.status)
}
// * Unrelated to inPreparation — both badges can show at once (stacked).
function inFlocking(o: Order) {
  return o.flocking_status === 'in_flocking' && !PREPARATION_DONE.includes(o.status)
}

const openMenuFor = ref<string | null>(null)
const confirmTarget = ref<{ order: Order; status: OrderStatus } | null>(null)
const busy = ref(false)

function toggleMenu(o: Order) {
  openMenuFor.value = openMenuFor.value === o.id ? null : o.id
}
function chooseStatus(o: Order, status: OrderStatus) {
  openMenuFor.value = null
  confirmTarget.value = { order: o, status }
}
async function applyStatus() {
  if (!confirmTarget.value) return
  busy.value = true
  try {
    await ordersStore.setStatus(confirmTarget.value.order.id, confirmTarget.value.status)
    toast.add({
      title: t('admin.orders.status.changed'),
      description: `${confirmTarget.value.order.order_number} → ${t(`admin.orders.status.${confirmTarget.value.status}`)}`,
      color: 'success',
    })
    confirmTarget.value = null
  } catch (err) {
    toast.add({
      title: t('admin.orders.status.changeFailed'),
      description: edgeErrorMessage(err),
      color: 'error',
    })
  } finally {
    busy.value = false
  }
}

// * Close the popover when clicking anywhere else.
onMounted(() => {
  const onDocClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null
    if (!t?.closest('[data-status-menu]')) openMenuFor.value = null
  }
  document.addEventListener('click', onDocClick)
  onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
})
</script>

<template>
  <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
    <div v-if="orders.length === 0" class="p-10 text-center">
      <UIcon name="i-lucide-shopping-cart" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p class="text-gray-500">{{ t('admin.orders.empty') }}</p>
    </div>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <!-- * px-2 between columns (edges keep px-4) so the table fits
                 13" laptops without horizontal scroll. -->
            <th class="pl-4 pr-2 py-3">{{ t('admin.orders.col.number') }}</th>
            <th class="px-2 py-3">{{ t('admin.orders.col.client') }}</th>
            <th class="px-2 py-3">{{ t('admin.orders.col.club') }}</th>
            <th class="px-2 py-3">
              <button
                type="button"
                class="inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200"
                :class="sortKey === 'amount' ? 'text-gray-700 dark:text-gray-200' : ''"
                @click="toggleSort('amount')"
              >
                {{ t('admin.orders.col.amount') }}
                <UIcon
                  :name="sortKey === 'amount' ? (sortDir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down'"
                  class="w-3 h-3"
                  :class="sortKey === 'amount' ? 'opacity-100' : 'opacity-40'"
                />
              </button>
            </th>
            <th class="px-2 py-3">
              <button
                type="button"
                class="inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200"
                :class="sortKey === 'status' ? 'text-gray-700 dark:text-gray-200' : ''"
                @click="toggleSort('status')"
              >
                {{ t('admin.orders.col.status') }}
                <UIcon
                  :name="sortKey === 'status' ? (sortDir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down'"
                  class="w-3 h-3"
                  :class="sortKey === 'status' ? 'opacity-100' : 'opacity-40'"
                />
              </button>
            </th>
            <th class="px-2 py-3">{{ t('admin.orders.col.preparation') }}</th>
            <th class="px-2 py-3">
              <button
                type="button"
                class="inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200"
                :class="sortKey === 'date' ? 'text-gray-700 dark:text-gray-200' : ''"
                @click="toggleSort('date')"
              >
                {{ t('admin.orders.col.date') }}
                <UIcon
                  :name="sortKey === 'date' ? (sortDir === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down'"
                  class="w-3 h-3"
                  :class="sortKey === 'date' ? 'opacity-100' : 'opacity-40'"
                />
              </button>
            </th>
            <th class="pl-2 pr-4 py-3 text-right">{{ t('admin.orders.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in sortedOrders" :key="o.id" class="border-t border-gray-100 dark:border-sidebar">
            <td class="pl-4 pr-2 py-3 font-medium">{{ o.order_number }}</td>
            <td class="px-2 py-3">
              <div class="font-medium truncate">{{ [o.guest_first_name, o.guest_last_name].filter(Boolean).join(' ') || '—' }}</div>
              <div class="text-xs text-gray-500 truncate">{{ o.guest_email }}</div>
            </td>
            <td class="px-2 py-3 text-gray-600 dark:text-gray-300">{{ o.club?.name || '—' }}</td>
            <td class="px-2 py-3 font-medium">{{ fmt(o.total) }}</td>
            <td class="px-2 py-3">
              <!-- * Inline status editor — click the badge, pick a target,
                   confirm in the modal. Falls back to read-only when no
                   forward transitions are available. -->
              <div class="relative inline-block" data-status-menu>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs cursor-pointer transition-shadow"
                  :class="[STATUS_STYLE[o.status], (TRANSITIONS[o.status]?.length ?? 0) > 0 ? 'hover:ring-2 hover:ring-current/30' : 'cursor-default']"
                  :disabled="(TRANSITIONS[o.status]?.length ?? 0) === 0"
                  :title="(TRANSITIONS[o.status]?.length ?? 0) > 0 ? t('admin.orders.status.editHint') : ''"
                  @click.stop="(TRANSITIONS[o.status]?.length ?? 0) > 0 && toggleMenu(o)"
                >
                  {{ t(`admin.orders.status.${o.status}`) }}
                  <UIcon
                    v-if="(TRANSITIONS[o.status]?.length ?? 0) > 0"
                    name="i-lucide-chevron-down"
                    class="w-3 h-3 opacity-70"
                  />
                </button>
                <div
                  v-if="openMenuFor === o.id"
                  class="absolute z-20 mt-1 left-0 min-w-[180px] bg-white dark:bg-sidebar-surface rounded-lg shadow-card-lg border border-gray-100 dark:border-sidebar py-1"
                  data-status-menu
                >
                  <button
                    v-for="s in TRANSITIONS[o.status] ?? []"
                    :key="s"
                    type="button"
                    class="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-sidebar flex items-center gap-2"
                    @click.stop="chooseStatus(o, s)"
                  >
                    <span class="w-2 h-2 rounded-full" :class="STATUS_STYLE[s].split(' ')[0]" />
                    {{ t(`admin.orders.status.${s}`) }}
                  </button>
                </div>
              </div>
            </td>
            <td class="px-2 py-3">
              <div class="flex flex-col items-start gap-1">
                <span
                  v-if="inPreparation(o)"
                  class="inline-flex px-2 py-0.5 rounded-full text-xs bg-brand-gold/10 text-brand-gold"
                >
                  {{ t('admin.orders.preparation.in_progress') }}
                </span>
                <span
                  v-if="inFlocking(o)"
                  class="inline-flex px-2 py-0.5 rounded-full text-xs bg-brand-purple/10 text-brand-purple"
                >
                  {{ t('admin.orders.preparation.in_flocking') }}
                </span>
              </div>
            </td>
            <td class="px-2 py-3 text-gray-500 text-xs">{{ fmtDate(o.created_at) }}</td>
            <td class="pl-2 pr-4 py-3">
              <!-- * 2×2 icon grid keeps the actions column narrow. -->
              <div class="grid grid-cols-2 gap-0.5 w-fit ml-auto">
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                :aria-label="t('admin.orders.actions.tracking')"
                :title="t('admin.orders.actions.tracking')"
                @click="$emit('tracking', o)"
              >
                <UIcon name="i-lucide-truck" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                :aria-label="t('admin.orders.actions.comments')"
                :title="t('admin.orders.actions.comments')"
                @click="$emit('comments', o)"
              >
                <UIcon name="i-lucide-message-square" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                :aria-label="t('admin.orders.actions.detail')"
                :title="t('admin.orders.actions.detail')"
                @click="$emit('open', o)"
              >
                <UIcon name="i-lucide-eye" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary"
                :aria-label="t('admin.orders.actions.refund')"
                :title="t('admin.orders.actions.refund')"
                @click="$emit('refund', o)"
              >
                <UIcon name="i-lucide-rotate-ccw" class="w-4 h-4" />
              </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AdminConfirmDialog
      :model-value="!!confirmTarget"
      :title="t('admin.orders.status.confirmTitle')"
      :message="confirmTarget
        ? t('admin.orders.status.confirmMessage', {
            n: confirmTarget.order.order_number,
            s: t(`admin.orders.status.${confirmTarget.status}`),
          })
        : ''"
      :confirm-label="t('admin.orders.status.confirmCta')"
      :busy="busy"
      :danger="false"
      @update:model-value="(v) => { if (!v) confirmTarget = null }"
      @confirm="applyStatus"
    />
  </div>
</template>
