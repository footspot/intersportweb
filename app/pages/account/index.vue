<script setup lang="ts">
// * Customer dashboard. Greets the signed-in customer and lists every order
// * placed under their account email (matched server-side by get_my_orders),
// * linking to the existing public order page for full details + live tracking.
// * Favorites and offers are previewed as upcoming features (no backend yet).
definePageMeta({ ssr: false, middleware: 'customer-only' })

const { t, locale } = useI18n()
const client = useSupabaseClient()
const auth = useAuthStore()
const favorites = useFavoritesStore()
const products = useProductsStore()

interface OrderRow {
  id: string
  order_number: string
  status: string
  total: number
  delivery_method: string
  created_at: string
  paid_at: string | null
  access_token: string
}

const orders = ref<OrderRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const tab = ref<'orders' | 'favorites' | 'offers'>('orders')

async function fetchOrders() {
  loading.value = true
  error.value = null
  try {
    const { data, error: rpcErr } = await client.rpc('get_my_orders')
    if (rpcErr) throw rpcErr
    orders.value = (data ?? []) as OrderRow[]
  } catch (e) {
    console.error('[account] get_my_orders failed', e)
    error.value = t('account.history.error')
  } finally {
    loading.value = false
  }
}
onMounted(fetchOrders)

// * Favorites: ensure the user's saved ids + the catalog are loaded, then
// * resolve each id to a full product for the grid (skipping any now-hidden).
onMounted(async () => {
  if (!favorites.loaded) await favorites.load()
  if (!products.items.length) await products.fetchAll()
})

const favoriteProducts = computed(() =>
  [...favorites.ids]
    .map((id) => products.byId(id))
    .filter((p): p is NonNullable<typeof p> => !!p),
)

// * Offers = the live deals from the catalogue: anything on clearance
// * (déstockage) or carrying a discount. Visible-only (fetchAll is RLS-filtered).
// * Biggest discounts first, then clearance items.
const offerProducts = computed(() =>
  products.items
    .filter((p) => p.is_on_clearance || Number(p.discount_percent ?? 0) > 0)
    .sort(
      (a, b) =>
        Number(b.discount_percent ?? 0) - Number(a.discount_percent ?? 0) ||
        Number(b.is_on_clearance) - Number(a.is_on_clearance),
    ),
)

// * Friendly first-name greeting: first word of full_name, else the email local part.
const displayName = computed(() => {
  const full = auth.profile?.full_name?.trim()
  if (full) return full.split(/\s+/)[0]
  const mail = auth.profile?.email
  return mail ? mail.split('@')[0] : ''
})

const localeTag = computed(() => (locale.value === 'en' ? 'en-US' : 'fr-FR'))
const today = computed(() =>
  new Date().toLocaleDateString(localeTag.value, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
)

function fmt(v: number | string | null | undefined) {
  return new Intl.NumberFormat(localeTag.value, { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(localeTag.value, { day: 'numeric', month: 'long', year: 'numeric' })
}

// * Reuse the public order page's status vocabulary for the badge label.
function statusLabel(s: string) {
  return t(`publicOrder.timeline.${s}`, s)
}
function statusClass(s: string) {
  if (s === 'delivered' || s === 'picked_up') return 'bg-emerald-100 text-emerald-700'
  if (s === 'cancelled' || s === 'refunded') return 'bg-gray-200 text-gray-600'
  if (s === 'shipped' || s === 'awaiting_pickup') return 'bg-blue-100 text-blue-700'
  return 'bg-amber-100 text-amber-700'
}
function statusIcon(s: string) {
  if (s === 'delivered' || s === 'picked_up') return 'i-lucide-check'
  if (s === 'cancelled' || s === 'refunded') return 'i-lucide-x'
  if (s === 'shipped' || s === 'awaiting_pickup') return 'i-lucide-truck'
  return 'i-lucide-clock'
}
// * In-transit orders get a "Track" CTA; everything else gets "Details".
function isTracking(s: string) {
  return s === 'shipped' || s === 'awaiting_pickup'
}

const tabs = [
  { key: 'orders' as const, icon: 'i-lucide-package' },
  { key: 'favorites' as const, icon: 'i-lucide-heart' },
  { key: 'offers' as const, icon: 'i-lucide-tag' },
]

async function signOut() {
  await auth.signOut()
}
</script>

<template>
  <section class="max-w-6xl mx-auto px-4 py-10 space-y-8">
    <!-- Greeting -->
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-heading text-4xl font-bold text-brand-primary">
          {{ t('account.dashboard.greeting', { name: '' }) }}<span class="text-brand-secondary">{{ displayName }}</span> 👋
        </h1>
        <p class="text-sm text-gray-400 mt-1 capitalize">{{ today }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 border-brand-secondary text-brand-secondary font-semibold text-sm hover:bg-brand-secondary hover:text-white transition"
        @click="signOut"
      >
        <UIcon name="i-lucide-log-out" class="w-4 h-4" />
        {{ t('account.dashboard.logout') }}
      </button>
    </header>

    <!-- Stat cards -->
    <div class="grid sm:grid-cols-3 gap-4">
      <div class="bg-white dark:bg-sidebar-surface rounded-2xl shadow-card-sm border border-black/5 dark:border-white/10 p-5 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-brand-primary/10 grid place-items-center shrink-0">
          <UIcon name="i-lucide-package" class="w-6 h-6 text-brand-primary" />
        </div>
        <div>
          <p class="font-heading text-3xl font-bold leading-none">{{ orders.length }}</p>
          <p class="text-sm text-gray-500 mt-1">{{ t('account.dashboard.statOrders') }}</p>
        </div>
      </div>
      <div class="bg-white dark:bg-sidebar-surface rounded-2xl shadow-card-sm border border-black/5 dark:border-white/10 p-5 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-rose-100 grid place-items-center shrink-0">
          <UIcon name="i-lucide-heart" class="w-6 h-6 text-rose-500" />
        </div>
        <div>
          <p class="font-heading text-3xl font-bold leading-none">{{ favorites.count }}</p>
          <p class="text-sm text-gray-500 mt-1">{{ t('account.dashboard.statFavorites') }}</p>
        </div>
      </div>
      <div class="bg-white dark:bg-sidebar-surface rounded-2xl shadow-card-sm border border-black/5 dark:border-white/10 p-5 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-emerald-100 grid place-items-center shrink-0">
          <UIcon name="i-lucide-tag" class="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <p class="font-heading text-3xl font-bold leading-none">{{ offerProducts.length }}</p>
          <p class="text-sm text-gray-500 mt-1">{{ t('account.dashboard.statOffers') }}</p>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-black/10 dark:border-white/10">
      <nav class="flex gap-1 -mb-px">
        <button
          v-for="tb in tabs"
          :key="tb.key"
          type="button"
          class="inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors"
          :class="tab === tb.key
            ? 'border-brand-primary text-brand-primary'
            : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'"
          @click="tab = tb.key"
        >
          <UIcon :name="tb.icon" class="w-4 h-4" />
          {{ t(`account.tabs.${tb.key}`) }}
        </button>
      </nav>
    </div>

    <!-- Orders tab -->
    <div v-if="tab === 'orders'">
      <div v-if="loading" class="p-12 text-center text-gray-400">
        <UIcon name="i-lucide-loader-2" class="w-7 h-7 animate-spin mx-auto" />
      </div>

      <div v-else-if="error" class="bg-brand-secondary/10 border border-brand-secondary/30 rounded-2xl p-6 text-sm text-brand-secondary">
        {{ error }}
      </div>

      <div v-else-if="!orders.length" class="bg-white dark:bg-sidebar-surface rounded-2xl shadow-card-sm border border-black/5 dark:border-white/10 p-12 text-center text-gray-500">
        <UIcon name="i-lucide-package-open" class="w-9 h-9 mx-auto mb-3 text-gray-300" />
        <p>{{ t('account.history.empty') }}</p>
        <NuxtLink to="/" class="inline-block mt-4 text-sm font-semibold text-brand-primary hover:underline">
          {{ t('account.history.browse') }}
        </NuxtLink>
      </div>

      <!-- Orders table -->
      <div v-else class="bg-white dark:bg-sidebar-surface rounded-2xl shadow-card-sm border border-black/5 dark:border-white/10 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-[11px] uppercase tracking-wider text-gray-400 bg-gray-50/70 dark:bg-sidebar/40">
                <th class="text-left font-semibold px-6 py-4">{{ t('account.history.colRef') }}</th>
                <th class="text-left font-semibold px-3 py-4">{{ t('account.history.colDate') }}</th>
                <th class="text-left font-semibold px-3 py-4">{{ t('account.history.colAmount') }}</th>
                <th class="text-left font-semibold px-3 py-4">{{ t('account.history.colStatus') }}</th>
                <th class="px-6 py-4" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in orders"
                :key="o.id"
                class="border-t border-black/5 dark:border-white/10 hover:bg-gray-50/60 dark:hover:bg-sidebar/30 transition-colors"
              >
                <td class="px-6 py-4 font-mono font-semibold text-brand-primary whitespace-nowrap">{{ o.order_number }}</td>
                <td class="px-3 py-4 text-gray-500 whitespace-nowrap">{{ fmtDate(o.created_at) }}</td>
                <td class="px-3 py-4 font-semibold whitespace-nowrap">{{ fmt(o.total) }}</td>
                <td class="px-3 py-4">
                  <span class="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full" :class="statusClass(o.status)">
                    <UIcon :name="statusIcon(o.status)" class="w-3 h-3" />
                    {{ statusLabel(o.status) }}
                  </span>
                </td>
                <td class="px-6 py-4 text-right whitespace-nowrap">
                  <NuxtLink
                    :to="`/order/${o.access_token}`"
                    class="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-black/10 dark:border-white/15 text-sm font-semibold hover:border-brand-primary hover:text-brand-primary transition"
                  >
                    {{ isTracking(o.status) ? t('account.history.track') : t('account.history.view') }}
                  </NuxtLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Favorites tab -->
    <div v-else-if="tab === 'favorites'">
      <div
        v-if="!favoriteProducts.length"
        class="bg-white dark:bg-sidebar-surface rounded-2xl shadow-card-sm border border-black/5 dark:border-white/10 p-14 text-center"
      >
        <div class="w-14 h-14 rounded-full bg-rose-100 grid place-items-center mx-auto mb-4">
          <UIcon name="i-lucide-heart" class="w-7 h-7 text-rose-500" />
        </div>
        <p class="font-heading text-xl font-bold text-brand-primary">{{ t('favorites.empty') }}</p>
        <p class="text-sm text-gray-500 mt-1.5 max-w-sm mx-auto">{{ t('favorites.emptyHint') }}</p>
        <NuxtLink to="/" class="inline-block mt-4 text-sm font-semibold text-brand-primary hover:underline">
          {{ t('account.history.browse') }}
        </NuxtLink>
      </div>

      <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <HomeProductCard v-for="p in favoriteProducts" :key="p.id" :product="p" />
      </div>
    </div>

    <!-- Offers tab — live clearance + discounted products -->
    <div v-else>
      <div
        v-if="products.loading && !offerProducts.length"
        class="p-12 text-center text-gray-400"
      >
        <UIcon name="i-lucide-loader-2" class="w-7 h-7 animate-spin mx-auto" />
      </div>

      <div
        v-else-if="!offerProducts.length"
        class="bg-white dark:bg-sidebar-surface rounded-2xl shadow-card-sm border border-black/5 dark:border-white/10 p-14 text-center"
      >
        <div class="w-14 h-14 rounded-full bg-emerald-100 grid place-items-center mx-auto mb-4">
          <UIcon name="i-lucide-tag" class="w-7 h-7 text-emerald-500" />
        </div>
        <p class="font-heading text-xl font-bold text-brand-primary">{{ t('account.dashboard.offersEmpty') }}</p>
        <p class="text-sm text-gray-500 mt-1.5 max-w-sm mx-auto">{{ t('account.dashboard.offersEmptyHint') }}</p>
      </div>

      <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <HomeProductCard v-for="p in offerProducts" :key="p.id" :product="p" />
      </div>
    </div>
  </section>
</template>
