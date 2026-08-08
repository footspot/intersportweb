<script setup lang="ts">
// * /admin — back-office dashboard. Wireframe-driven layout.
import { useAuthStore } from '~/stores/auth'
import { useOrdersStore, type Order, type OrderStatus } from '~/stores/orders'
import { useProductsStore } from '~/stores/products'
import { useClubsStore } from '~/stores/clubs'
import { useUsersStore } from '~/stores/users'

definePageMeta({ layout: 'admin', middleware: ['backoffice'], ssr: false })

const { t, locale } = useI18n()
const auth = useAuthStore()
const orders = useOrdersStore()
const products = useProductsStore()
const clubs = useClubsStore()
const users = useUsersStore()

const range = ref<'6m' | '12m'>('12m')

// * Bootstrap dashboard data. Users + clubs are admin-only — silently skip
// * for employees so we don't poison Promise.all with a 403.
await useAsyncData('admin-dashboard-bootstrap', async () => {
  const tasks: Promise<unknown>[] = [orders.fetchAll(), products.fetchAll()]
  if (auth.isAdmin) {
    tasks.push(clubs.fetchAll(), users.fetchAll())
  }
  await Promise.all(tasks)
  return true
})

const REVENUE_STATUSES: OrderStatus[] = ['paid', 'partially_refunded', 'shipped', 'delivered']

function isRevenueOrder(o: Order) {
  return REVENUE_STATUSES.includes(o.status)
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}
function fmtCurrencyDecimals(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

const NOW = computed(() => new Date())

function rangeWindow(daysAgoStart: number, daysAgoEnd: number) {
  const end = new Date(NOW.value)
  end.setDate(end.getDate() - daysAgoStart)
  const start = new Date(NOW.value)
  start.setDate(start.getDate() - daysAgoEnd)
  return { start, end }
}

function delta(curr: number, prev: number): number | null {
  if (prev <= 0) return null
  return ((curr - prev) / prev) * 100
}

interface PeriodSummary {
  revenue: number
  count: number
  clubRevenue: number
  clubCount: number
}

function summarize(window: { start: Date; end: Date }): PeriodSummary {
  let revenue = 0
  let count = 0
  let clubRevenue = 0
  let clubCount = 0
  for (const o of orders.items) {
    if (!isRevenueOrder(o)) continue
    const t = new Date(o.created_at)
    if (t < window.start || t >= window.end) continue
    const total = Number(o.total ?? 0)
    revenue += total
    count += 1
    if (o.club_id) {
      clubRevenue += total
      clubCount += 1
    }
  }
  return { revenue, count, clubRevenue, clubCount }
}

const last30 = computed(() => summarize(rangeWindow(0, 30)))
const prev30 = computed(() => summarize(rangeWindow(30, 60)))

const kpis = computed(() => {
  const c = last30.value
  const p = prev30.value
  const avgClub = c.clubCount > 0 ? c.clubRevenue / c.clubCount : 0
  const prevAvgClub = p.clubCount > 0 ? p.clubRevenue / p.clubCount : 0
  const activeProducts = products.items.filter((x) => x.is_visible).length
  return [
    {
      key: 'revenue',
      label: t('admin.dashboard.kpi.revenue'),
      value: fmtCurrency(c.revenue),
      delta: delta(c.revenue, p.revenue),
      icon: 'i-lucide-euro',
      stripe: 'bg-brand-primary',
      tile: 'bg-brand-primary/10 text-brand-primary',
    },
    {
      key: 'orders',
      label: t('admin.dashboard.kpi.orders'),
      value: String(c.count),
      delta: delta(c.count, p.count),
      icon: 'i-lucide-package',
      stripe: 'bg-brand-green',
      tile: 'bg-brand-green/10 text-brand-green',
    },
    {
      key: 'avgClub',
      label: t('admin.dashboard.kpi.averageClub'),
      value: fmtCurrency(avgClub),
      delta: delta(avgClub, prevAvgClub),
      icon: 'i-lucide-bar-chart-3',
      stripe: 'bg-brand-gold',
      tile: 'bg-brand-gold/10 text-brand-gold',
    },
    {
      key: 'activeProducts',
      label: t('admin.dashboard.kpi.activeProducts'),
      value: String(activeProducts),
      // * No historical snapshot — don't fake a delta.
      delta: null as number | null,
      icon: 'i-lucide-shirt',
      stripe: 'bg-brand-purple',
      tile: 'bg-brand-purple/10 text-brand-purple',
    },
  ]
})

// * --- Revenue chart (monthly buckets) ---
interface Bucket {
  key: string
  label: string
  total: number
}

const monthLabelsFr = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']
const monthLabelsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const revenueBuckets = computed<Bucket[]>(() => {
  const months = range.value === '6m' ? 6 : 12
  const labels = locale.value === 'en' ? monthLabelsEn : monthLabelsFr
  const buckets: Bucket[] = []
  const now = NOW.value
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: labels[d.getMonth()] ?? '',
      total: 0,
    })
  }
  const idx: Record<string, number> = {}
  buckets.forEach((b, i) => { idx[b.key] = i })

  for (const o of orders.items) {
    if (!isRevenueOrder(o)) continue
    const dt = new Date(o.created_at)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    const at = idx[key]
    if (at !== undefined) buckets[at].total += Number(o.total ?? 0)
  }
  return buckets
})

const chart = computed(() => {
  const W = 900
  const H = 220
  const padX = 28
  const padTop = 16
  const padBottom = 32
  const series = revenueBuckets.value
  const max = Math.max(1, ...series.map((b) => b.total))
  const innerW = W - padX * 2
  const innerH = H - padTop - padBottom
  const stepX = series.length > 1 ? innerW / (series.length - 1) : innerW

  const points = series.map((b, i) => {
    const x = padX + stepX * i
    const y = padTop + innerH - (innerH * b.total) / max
    return { x, y, label: b.label, total: b.total, key: b.key }
  })

  // * Smooth curve via Catmull-Rom → cubic Bezier conversion.
  function pathFor(pts: { x: number; y: number }[], close: boolean) {
    if (pts.length === 0) return ''
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
    let d = `M ${pts[0].x} ${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[i + 2] ?? p2
      const c1x = p1.x + (p2.x - p0.x) / 6
      const c1y = p1.y + (p2.y - p0.y) / 6
      const c2x = p2.x - (p3.x - p1.x) / 6
      const c2y = p2.y - (p3.y - p1.y) / 6
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
    }
    if (close) {
      const last = pts[pts.length - 1]
      const first = pts[0]
      d += ` L ${last.x} ${padTop + innerH} L ${first.x} ${padTop + innerH} Z`
    }
    return d
  }

  return {
    W, H, padX, padTop, padBottom, innerH,
    points,
    line: pathFor(points, false),
    area: pathFor(points, true),
    baselineY: padTop + innerH,
    hasData: series.some((b) => b.total > 0),
  }
})

// * --- Recent orders ---
// * Abandoned checkouts are hidden here like on /admin/orders.
const recentOrders = computed<Order[]>(() =>
  orders.items.filter((o) => o.status !== 'abandoned').slice(0, 5),
)

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

function customerInitials(o: Order) {
  const name = [o.guest_first_name, o.guest_last_name].filter(Boolean).join(' ').trim()
    || o.guest_email
    || '?'
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function itemCount(o: Order) {
  return o.items?.reduce((acc, it) => acc + (it.quantity ?? 0), 0) ?? 0
}

// * --- Tabs row (navigation) ---
const tabs = computed(() => [
  { key: 'overview', to: '/admin', label: t('admin.dashboard.tabs.overview'), icon: 'i-lucide-layout-dashboard', adminOnly: false },
  { key: 'products', to: '/admin/products', label: t('admin.dashboard.tabs.products'), icon: 'i-lucide-package', adminOnly: false },
  { key: 'clubs', to: '/admin/clubs', label: t('admin.dashboard.tabs.clubs'), icon: 'i-lucide-shield', adminOnly: true },
  { key: 'orders', to: '/admin/orders', label: t('admin.dashboard.tabs.orders'), icon: 'i-lucide-shopping-cart', adminOnly: false },
  { key: 'stats', to: '/admin/stats', label: t('admin.dashboard.tabs.stats'), icon: 'i-lucide-bar-chart-3', adminOnly: true },
  { key: 'users', to: '/admin/users', label: t('admin.dashboard.tabs.users'), icon: 'i-lucide-users', adminOnly: true },
])

// * --- Quick actions ---
const productCount = computed(() => products.items.length)
const userCount = computed(() => users.items.filter((u) => u.active).length)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h1 class="font-heading text-2xl font-bold">{{ t('admin.dashboard.title') }}</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.dashboard.breadcrumb') }}</p>
    </div>

    <div class="-mx-1 overflow-x-auto">
      <div class="px-1 flex gap-2 min-w-max">
        <NuxtLink
          v-for="tab in tabs"
          v-show="!tab.adminOnly || auth.isAdmin"
          :key="tab.key"
          :to="tab.to"
          :class="[
            'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap border',
            tab.key === 'overview'
              ? 'bg-brand-primary text-white border-brand-primary shadow-card-sm'
              : 'bg-white dark:bg-sidebar-surface text-gray-700 dark:text-gray-300 border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar',
          ]"
        >
          <UIcon :name="tab.icon" class="w-4 h-4" />
          {{ tab.label }}
        </NuxtLink>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <div
        v-for="k in kpis"
        :key="k.key"
        class="relative overflow-hidden bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5"
      >
        <span class="absolute inset-x-0 top-0 h-1" :class="k.stripe" aria-hidden="true" />
        <div class="flex items-start justify-between gap-3 mb-3">
          <span
            class="w-10 h-10 rounded-xl inline-flex items-center justify-center"
            :class="k.tile"
          >
            <UIcon :name="k.icon" class="w-5 h-5" />
          </span>
          <span
            v-if="k.delta !== null"
            :class="[
              'inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md',
              k.delta >= 0 ? 'text-brand-green bg-brand-green/10' : 'text-brand-secondary bg-brand-secondary/10',
            ]"
          >
            <UIcon :name="k.delta >= 0 ? 'i-lucide-arrow-up-right' : 'i-lucide-arrow-down-right'" class="w-3 h-3" />
            {{ Math.abs(Math.round(k.delta)) }}%
          </span>
        </div>
        <div class="font-heading text-2xl sm:text-3xl font-bold leading-tight">{{ k.value }}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">{{ k.label }}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <section class="lg:col-span-2 bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 class="font-heading font-bold">{{ t('admin.dashboard.revenueByMonth') }}</h2>
          <div class="inline-flex bg-gray-100 dark:bg-sidebar rounded-lg p-1 text-xs">
            <button
              type="button"
              :class="[
                'px-3 py-1.5 rounded-md font-medium transition-colors',
                range === '6m'
                  ? 'bg-white dark:bg-sidebar-surface text-gray-900 dark:text-white shadow-card-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200',
              ]"
              @click="range = '6m'"
            >
              {{ t('admin.dashboard.range.6m') }}
            </button>
            <button
              type="button"
              :class="[
                'px-3 py-1.5 rounded-md font-medium transition-colors',
                range === '12m'
                  ? 'bg-brand-primary text-white shadow-card-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-200',
              ]"
              @click="range = '12m'"
            >
              {{ t('admin.dashboard.range.12m') }}
            </button>
          </div>
        </div>

        <div class="relative">
          <div v-if="!chart.hasData" class="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">
            {{ t('admin.dashboard.noData') }}
          </div>
          <svg
            :viewBox="`0 0 ${chart.W} ${chart.H}`"
            class="w-full h-[220px]"
            preserveAspectRatio="none"
            role="img"
            :aria-label="t('admin.dashboard.revenueByMonth')"
          >
            <defs>
              <linearGradient id="revArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--color-brand-primary)" stop-opacity="0.25" />
                <stop offset="100%" stop-color="var(--color-brand-primary)" stop-opacity="0" />
              </linearGradient>
            </defs>
            <g v-for="i in 4" :key="i">
              <line
                :x1="chart.padX"
                :x2="chart.W - chart.padX"
                :y1="chart.padTop + (chart.innerH * (i - 1)) / 4"
                :y2="chart.padTop + (chart.innerH * (i - 1)) / 4"
                class="stroke-gray-100 dark:stroke-sidebar"
                stroke-width="1"
              />
            </g>
            <line
              :x1="chart.padX"
              :x2="chart.W - chart.padX"
              :y1="chart.baselineY"
              :y2="chart.baselineY"
              class="stroke-gray-200 dark:stroke-sidebar"
              stroke-width="1"
            />

            <path v-if="chart.hasData" :d="chart.area" fill="url(#revArea)" />
            <path
              v-if="chart.hasData"
              :d="chart.line"
              fill="none"
              stroke="var(--color-brand-primary)"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <g v-if="chart.hasData">
              <circle
                v-for="(p, i) in chart.points"
                :key="`pt-${i}`"
                :cx="p.x"
                :cy="p.y"
                r="3"
                fill="white"
                stroke="var(--color-brand-primary)"
                stroke-width="2"
              >
                <title>{{ p.label }} · {{ fmtCurrency(p.total) }}</title>
              </circle>
            </g>

            <text
              v-for="(p, i) in chart.points"
              :key="`lbl-${i}`"
              :x="p.x"
              :y="chart.H - 10"
              text-anchor="middle"
              class="fill-gray-400"
              font-size="11"
            >
              {{ p.label }}
            </text>
          </svg>
        </div>

        <div class="flex items-center gap-2 mt-3 text-xs text-gray-500">
          <span class="w-2.5 h-2.5 rounded-sm bg-brand-primary" />
          {{ t('admin.dashboard.revenue') }}
        </div>
      </section>

      <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-heading font-bold">{{ t('admin.dashboard.recent.title') }}</h2>
          <NuxtLink
            to="/admin/orders"
            class="text-xs text-brand-primary hover:text-brand-primary-dark font-medium inline-flex items-center gap-1"
          >
            {{ t('admin.dashboard.recent.viewAll') }}
            <UIcon name="i-lucide-chevron-right" class="w-3 h-3" />
          </NuxtLink>
        </div>

        <ul v-if="recentOrders.length > 0" class="space-y-3">
          <li
            v-for="o in recentOrders"
            :key="o.id"
            class="flex items-center gap-3"
          >
            <span class="shrink-0 w-9 h-9 rounded-full bg-brand-primary/10 text-brand-primary inline-flex items-center justify-center text-xs font-semibold">
              {{ customerInitials(o) }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-sm font-medium truncate">{{ [o.guest_first_name, o.guest_last_name].filter(Boolean).join(' ') || o.guest_email || '—' }}</span>
                <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-sidebar text-gray-500">
                  {{ o.order_number }}
                </span>
              </div>
              <div class="text-xs text-gray-500 truncate">
                {{ o.club?.name || '—' }}<template v-if="itemCount(o)"> — {{ t('admin.dashboard.recent.articles', { n: itemCount(o) }) }}</template>
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-sm font-semibold">{{ fmtCurrencyDecimals(Number(o.total ?? 0)) }}</div>
              <span
                class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] mt-0.5"
                :class="STATUS_STYLE[o.status]"
              >
                {{ t(`admin.orders.status.${o.status}`) }}
              </span>
            </div>
          </li>
        </ul>
        <div v-else class="py-8 text-center text-sm text-gray-400">
          {{ t('admin.dashboard.noData') }}
        </div>
      </section>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <NuxtLink
        to="/admin/products"
        class="group bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5 flex items-center gap-4 hover:shadow-card-md transition-shadow"
      >
        <span class="w-11 h-11 rounded-xl bg-brand-gold/10 text-brand-gold inline-flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-package-plus" class="w-5 h-5" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="font-heading font-semibold truncate">{{ t('admin.dashboard.quick.addProduct') }}</div>
          <div class="text-xs text-gray-500 truncate">
            {{ t('admin.dashboard.quick.addProductHint', { n: productCount }) }}
          </div>
        </div>
        <UIcon
          name="i-lucide-arrow-right"
          class="w-4 h-4 text-gray-400 group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all"
        />
      </NuxtLink>

      <NuxtLink
        v-if="auth.isAdmin"
        to="/admin/fund"
        class="group bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5 flex items-center gap-4 hover:shadow-card-md transition-shadow"
      >
        <span class="w-11 h-11 rounded-xl bg-brand-green/10 text-brand-green inline-flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-piggy-bank" class="w-5 h-5" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="font-heading font-semibold truncate">{{ t('admin.dashboard.quick.manageFund') }}</div>
          <div class="text-xs text-gray-500 truncate">{{ t('admin.dashboard.quick.manageFundHint') }}</div>
        </div>
        <UIcon
          name="i-lucide-arrow-right"
          class="w-4 h-4 text-gray-400 group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all"
        />
      </NuxtLink>

      <NuxtLink
        v-if="auth.isAdmin"
        to="/admin/users"
        class="group bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5 flex items-center gap-4 hover:shadow-card-md transition-shadow"
      >
        <span class="w-11 h-11 rounded-xl bg-brand-purple/10 text-brand-purple inline-flex items-center justify-center shrink-0">
          <UIcon name="i-lucide-users" class="w-5 h-5" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="font-heading font-semibold truncate">{{ t('admin.dashboard.quick.manageUsers') }}</div>
          <div class="text-xs text-gray-500 truncate">
            {{ t('admin.dashboard.quick.manageUsersHint', { n: userCount }) }}
          </div>
        </div>
        <UIcon
          name="i-lucide-arrow-right"
          class="w-4 h-4 text-gray-400 group-hover:text-brand-primary group-hover:translate-x-0.5 transition-all"
        />
      </NuxtLink>
    </div>
  </div>
</template>
