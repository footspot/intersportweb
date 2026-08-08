<script setup lang="ts">
// * /admin/orders — admin + employee. Live realtime feed with beep on paid.
import { useOrdersStore, type Order, type OrderStatus } from '~/stores/orders'
import { useClubsStore } from '~/stores/clubs'
import { useProductsStore } from '~/stores/products'
import { useRealtimeOrders } from '~/composables/useRealtimeOrders'
import type { Period } from '~/components/admin/FiltersBar.vue'

definePageMeta({ layout: 'admin', middleware: ['backoffice'], ssr: false })

const { t } = useI18n()
const orders = useOrdersStore()
const clubs = useClubsStore()
const products = useProductsStore()
const toast = useToast()

type FilterValue = 'all' | OrderStatus
type DeliveryFilter = 'all' | 'colissimo' | 'club_pickup' | 'shop_pickup'
const filter = ref<FilterValue>('all')
const deliveryFilter = ref<DeliveryFilter>('all')
const search = ref('')

// * Catalogue filters — same bar as /admin/stats, but period defaults to 'all'
// * so opening the page still shows the whole list.
const period = ref<Period>('all')
function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dateFrom = ref(isoDay(new Date(Date.now() - 30 * 86_400_000)))
const dateTo = ref(isoDay(new Date()))
const clubId = ref<string | null>(null)
const category = ref<string | null>(null)
const productId = ref<string | null>(null)
const size = ref<string | null>(null)
const reference = ref('')

const orderPeriods: Period[] = ['all', '7d', '30d', '90d', '12m', 'custom']

const detailOpen = ref(false)
const detailId = ref<string | null>(null)

const trackingOpen = ref(false)
const trackingOrder = ref<Order | null>(null)

const refundOpen = ref(false)
const refundOrder = ref<Order | null>(null)

const commentsOpen = ref(false)
const commentsOrder = ref<Order | null>(null)

const exportOpen = ref(false)
const flockingOpen = ref(false)

// * CSV export of the filtered orders — built client-side from the loaded
// * list; semicolon-separated with a UTF-8 BOM so French Excel opens it as-is.
function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportCsv() {
  const num = (v: number | string) => Number(v ?? 0).toFixed(2).replace('.', ',')
  const cols = ['number', 'date', 'status', 'client', 'email', 'club', 'delivery', 'payment', 'items', 'subtotal', 'shippingCost', 'refunds', 'total', 'tracking']
  const header = cols.map((k) => t(`admin.orders.export.csv.${k}`))
  const rows = filteredOrders.value.map((o) => [
    o.order_number,
    new Date(o.created_at).toLocaleString('fr-FR'),
    t(`admin.orders.status.${o.status}`),
    [o.guest_first_name, o.guest_last_name].filter(Boolean).join(' '),
    o.guest_email ?? '',
    o.club?.name ?? '',
    t(`admin.orders.deliveryFilter.${o.delivery_method}`),
    o.payment_method ?? '',
    (o.items ?? [])
      .map((it) => `${it.quantity}x ${it.product?.name?.fr ?? ''} (${[it.size, it.secondary_size].filter(Boolean).join('/')})`)
      .join(' | '),
    num(o.subtotal),
    num(o.shipping_cost),
    num(o.refund_total),
    num(o.total),
    o.shipping_tracking ?? '',
  ])
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `commandes-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

await useAsyncData('admin-orders-page', async () => {
  await Promise.all([orders.fetchAll(), clubs.fetchAll(), products.fetchAll()])
  return true
})

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
  { value: 'abandoned', label: 'admin.orders.filter.abandoned' },
]

const deliveryFilters: Array<{ value: DeliveryFilter; label: string }> = [
  { value: 'all', label: 'admin.orders.deliveryFilter.all' },
  { value: 'colissimo', label: 'admin.orders.deliveryFilter.colissimo' },
  { value: 'club_pickup', label: 'admin.orders.deliveryFilter.club_pickup' },
  { value: 'shop_pickup', label: 'admin.orders.deliveryFilter.shop_pickup' },
]

const categories = computed(() =>
  Array.from(new Set(products.items.map((p) => p.category).filter(Boolean) as string[])).sort(),
)

// * Sizes offered by the picked product, else every size seen in the loaded
// * orders (mirrors the stats bar, which falls back to the sold-size list).
const availableSizes = computed<string[]>(() => {
  if (productId.value) {
    const p = products.byId(productId.value)
    if (p) return Array.from(new Set(p.variants.map((v) => v.size).filter(Boolean))).sort()
  }
  const set = new Set<string>()
  for (const o of orders.items) {
    for (const it of o?.items ?? []) {
      if (it.size) set.add(it.size)
      if (it.secondary_size) set.add(it.secondary_size)
    }
  }
  return [...set].sort()
})

// * Lower bound of the selected period, as an epoch ms. null = no bound.
const periodStart = computed<number | null>(() => {
  const now = new Date()
  switch (period.value) {
    case '7d': return now.getTime() - 7 * 86_400_000
    case '30d': return now.getTime() - 30 * 86_400_000
    case '90d': return now.getTime() - 90 * 86_400_000
    case '12m': return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).getTime()
    case 'custom': return dateFrom.value ? new Date(`${dateFrom.value}T00:00:00`).getTime() : null
    default: return null
  }
})
const periodEnd = computed<number | null>(() =>
  period.value === 'custom' && dateTo.value
    ? new Date(`${dateTo.value}T23:59:59.999`).getTime()
    : null,
)

// * Order-level predicates, everything except the status pills — used both for
// * the table and for the per-status counts, so the badges track the filters.
function matchesBase(o: Order): boolean {
  if (!o) return false

  const created = new Date(o.created_at).getTime()
  if (periodStart.value !== null && created < periodStart.value) return false
  if (periodEnd.value !== null && created > periodEnd.value) return false

  if (clubId.value && o.club_id !== clubId.value) return false
  if (deliveryFilter.value !== 'all' && o.delivery_method !== deliveryFilter.value) return false

  const q = search.value.trim().toLowerCase()
  if (q) {
    const hay = `${o.order_number} ${o.guest_email ?? ''} ${o.guest_first_name ?? ''} ${o.guest_last_name ?? ''}`.toLowerCase()
    if (!hay.includes(q)) return false
  }

  // * Line-level filters compose: one line must satisfy all of them at once
  // * ("orders containing product X in size M"), not one line each.
  const ref = reference.value.trim().toLowerCase()
  if (category.value || productId.value || size.value || ref) {
    const hit = (o.items ?? []).some((it) => {
      if (productId.value && it.product_id !== productId.value) return false
      if (category.value && it.product?.category !== category.value) return false
      if (size.value && it.size !== size.value && it.secondary_size !== size.value) return false
      if (ref && !(it.product?.reference ?? '').toLowerCase().includes(ref)) return false
      return true
    })
    if (!hit) return false
  }

  return true
}

const baseOrders = computed<Order[]>(() => orders.items.filter(matchesBase))

// * Abandoned checkouts (never paid, auto-expired) are noise for day-to-day
// * order handling: 'all' hides them, they only show via their own pill.
const counts = computed<Record<string, number>>(() => {
  const acc: Record<string, number> = { all: 0 }
  for (const o of baseOrders.value) {
    acc[o.status] = (acc[o.status] ?? 0) + 1
    if (o.status !== 'abandoned') acc.all += 1
  }
  return acc
})

const filteredOrders = computed<Order[]>(() =>
  filter.value === 'all'
    ? baseOrders.value.filter((o) => o.status !== 'abandoned')
    : baseOrders.value.filter((o) => o.status === filter.value),
)

// * Flocking order scope — the filtered list, restricted to paid orders
// * (partially refunded ones are still paid; their live lines need flocking).
const flockingOrders = computed<Order[]>(() =>
  filteredOrders.value.filter((o) => o.status === 'paid' || o.status === 'partially_refunded'),
)

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
          {{ counts[f.value] ?? 0 }}
        </span>
      </button>
    </div>

    <!-- * Period / club / catalogue filters — shared with /admin/stats -->
    <AdminFiltersBar
      :period="period"
      :periods="orderPeriods"
      :date-from="dateFrom"
      :date-to="dateTo"
      :club-id="clubId"
      :category="category"
      :product-id="productId"
      :size="size"
      :reference="reference"
      :clubs="clubs.items"
      :categories="categories"
      :products="products.items"
      :available-sizes="availableSizes"
      @update:period="(v) => (period = v)"
      @update:date-from="(v) => (dateFrom = v)"
      @update:date-to="(v) => (dateTo = v)"
      @update:club-id="(v) => (clubId = v)"
      @update:category="(v) => (category = v)"
      @update:product-id="(v) => (productId = v)"
      @update:size="(v) => (size = v)"
      @update:reference="(v) => (reference = v)"
    >
      <!-- * Export the currently filtered orders (flocking order / merged PDF / CSV) -->
      <div class="ml-auto flex items-center gap-2">
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300 hover:opacity-90 disabled:opacity-60"
          :disabled="flockingOrders.length === 0"
          @click="flockingOpen = true"
        >
          <UIcon name="i-lucide-shirt" class="w-3.5 h-3.5" />
          <span>{{ t('admin.orders.flocking.button') }}</span>
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300 hover:opacity-90 disabled:opacity-60"
          :disabled="filteredOrders.length === 0"
          @click="exportCsv"
        >
          <UIcon name="i-lucide-file-spreadsheet" class="w-3.5 h-3.5" />
          <span>{{ t('admin.orders.export.csvButton') }}</span>
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-brand-primary text-white hover:opacity-90 disabled:opacity-60"
          :disabled="filteredOrders.length === 0"
          @click="exportOpen = true"
        >
          <UIcon name="i-lucide-download" class="w-3.5 h-3.5" />
          <span>{{ t('admin.orders.export.button') }}</span>
          <span class="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] bg-white/20">
            {{ filteredOrders.length }}
          </span>
        </button>
      </div>
    </AdminFiltersBar>

    <!-- * Delivery-method filter -->
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
    <AdminOrdersExportModal v-model="exportOpen" :orders="filteredOrders" />
    <AdminOrdersFlockingModal v-model="flockingOpen" :orders="flockingOrders" />
    <AdminOrdersCommentsModal v-model="commentsOpen" :order="commentsOrder" />
    <AdminOrdersTrackingModal v-model="trackingOpen" :order="trackingOrder" @saved="orders.fetchAll()" />
    <AdminOrdersRefundModal v-model="refundOpen" :order="refundOrder" @refunded="orders.fetchAll()" />
  </div>
</template>
