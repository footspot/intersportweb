<script setup lang="ts">
// * /admin/orders — admin + employee. Live realtime feed with beep on paid.
import { useOrdersStore, type Order, type OrderStatus } from '~/stores/orders'
import { useRealtimeOrders } from '~/composables/useRealtimeOrders'

definePageMeta({ layout: 'admin', middleware: ['backoffice'], ssr: false })

const { t } = useI18n()
const orders = useOrdersStore()
const toast = useToast()

type FilterValue = 'all' | OrderStatus
type DeliveryFilter = 'all' | 'colissimo' | 'club_pickup' | 'shop_pickup'
const filter = ref<FilterValue>('all')
const clubFilter = ref<string>('all')
const deliveryFilter = ref<DeliveryFilter>('all')
const search = ref('')

const detailOpen = ref(false)
const detailId = ref<string | null>(null)

const trackingOpen = ref(false)
const trackingOrder = ref<Order | null>(null)

const refundOpen = ref(false)
const refundOrder = ref<Order | null>(null)

const commentsOpen = ref(false)
const commentsOrder = ref<Order | null>(null)

await useAsyncData('admin-orders-page', async () => { await orders.fetchAll(); return true })

useRealtimeOrders({
  onPaid(o) {
    toast.add({
      title: t('admin.orders.toast.newPaid'),
      description: `${o.order_number} — ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(o.total))}`,
      color: 'success',
    })
  },
})

const filters: Array<{ value: FilterValue; label: string }> = [
  { value: 'all', label: 'admin.orders.filter.all' },
  { value: 'pending', label: 'admin.orders.filter.pending' },
  { value: 'paid', label: 'admin.orders.filter.paid' },
  { value: 'shipped', label: 'admin.orders.filter.shipped' },
  { value: 'delivered', label: 'admin.orders.filter.delivered' },
  { value: 'cancelled', label: 'admin.orders.filter.cancelled' },
  { value: 'refunded', label: 'admin.orders.filter.refunded' },
]

// * Club options derived from the loaded orders — only clubs that actually
// * have orders show up in the filter.
const clubOptions = computed(() => {
  const map = new Map<string, string>()
  for (const o of orders.items) {
    if (o?.club_id && o.club?.name) map.set(o.club_id, o.club.name)
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const deliveryFilters: Array<{ value: DeliveryFilter; label: string }> = [
  { value: 'all', label: 'admin.orders.deliveryFilter.all' },
  { value: 'colissimo', label: 'admin.orders.deliveryFilter.colissimo' },
  { value: 'club_pickup', label: 'admin.orders.deliveryFilter.club_pickup' },
  { value: 'shop_pickup', label: 'admin.orders.deliveryFilter.shop_pickup' },
]

const filteredOrders = computed<Order[]>(() => {
  const q = search.value.trim().toLowerCase()
  return orders.items.filter((o) => {
    if (!o) return false
    if (filter.value !== 'all' && o.status !== filter.value) return false
    if (clubFilter.value !== 'all' && o.club_id !== clubFilter.value) return false
    if (deliveryFilter.value !== 'all' && o.delivery_method !== deliveryFilter.value) return false
    if (q) {
      const hay = `${o.order_number} ${o.guest_email ?? ''} ${o.guest_first_name ?? ''} ${o.guest_last_name ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

function openDetail(o: Order) {
  detailId.value = o.id
  detailOpen.value = true
}
function openTracking(o: Order) {
  trackingOrder.value = o
  trackingOpen.value = true
}
function openRefund(o: Order) {
  refundOrder.value = o
  refundOpen.value = true
}
function openComments(o: Order) {
  commentsOrder.value = o
  commentsOpen.value = true
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.orders.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.orders.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-3">
        <AdminOrdersRealtimeBadge />
        <div class="relative">
          <input
            v-model="search"
            type="text"
            :placeholder="t('admin.orders.searchPlaceholder')"
            class="w-80 pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
          <UIcon name="i-lucide-search" class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="f in filters"
        :key="f.value"
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2"
        :class="filter === f.value ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="filter = f.value"
      >
        <span>{{ t(f.label) }}</span>
        <span
          class="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px]"
          :class="filter === f.value ? 'bg-white/20' : 'bg-gray-200 dark:bg-sidebar-surface text-gray-500'"
        >
          {{ orders.counts[f.value === 'all' ? 'all' : f.value] ?? 0 }}
        </span>
      </button>
    </div>

    <!-- * Club + delivery-method filters -->
    <div class="flex flex-wrap items-center gap-3">
      <select
        v-model="clubFilter"
        class="px-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
      >
        <option value="all">{{ t('admin.orders.clubFilter.all') }}</option>
        <option v-for="c in clubOptions" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="f in deliveryFilters"
          :key="f.value"
          type="button"
          class="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5"
          :class="deliveryFilter === f.value ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
          @click="deliveryFilter = f.value"
        >
          <UIcon
            v-if="f.value !== 'all'"
            :name="f.value === 'colissimo' ? 'i-lucide-truck' : f.value === 'club_pickup' ? 'i-lucide-building' : 'i-lucide-store'"
            class="w-3 h-3"
          />
          <span>{{ t(f.label) }}</span>
        </button>
      </div>
    </div>

    <div v-if="orders.loading" class="p-10 text-center text-gray-500">
      {{ t('common.loading') }}
    </div>
    <AdminOrdersTable
      v-else
      :orders="filteredOrders"
      @open="openDetail"
      @tracking="openTracking"
      @refund="openRefund"
      @comments="openComments"
    />

    <AdminOrdersOrderDetailDrawer v-model="detailOpen" :order-id="detailId" />
    <AdminOrdersCommentsModal v-model="commentsOpen" :order="commentsOrder" />
    <AdminOrdersTrackingModal v-model="trackingOpen" :order="trackingOrder" @saved="orders.fetchAll()" />
    <AdminOrdersRefundModal v-model="refundOpen" :order="refundOrder" @refunded="orders.fetchAll()" />
  </div>
</template>
