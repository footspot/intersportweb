<script setup lang="ts">
// * /admin/stats — analytics dashboard. Admin only.
// * Sends filter payload to admin-stats; server returns pre-aggregated JSON.
import { useClubsStore } from '~/stores/clubs'
import { useProductsStore } from '~/stores/products'
import { invokeEdge } from '~/composables/useEdgeFunction'
import type { Period } from '~/components/admin/stats/FiltersBar.vue'

definePageMeta({ layout: 'admin', middleware: ['admin'] })

const { t } = useI18n()
const clubs = useClubsStore()
const products = useProductsStore()

const period = ref<Period>('7d')
const clubId = ref<string | null>(null)
const category = ref<string | null>(null)
const productId = ref<string | null>(null)
const size = ref<string | null>(null)
const reference = ref('')

interface StatsPayload {
  kpis: {
    revenue: number
    margin: number
    orders: number
    average_basket: number
    active_products: number
    total_fund: number
  }
  revenue_series: Array<{ bucket: string; revenue: number; margin: number }>
  revenue_by_sport: Array<{ label: string; value: number }>
  size_breakdown: Array<{ size: string; qty: number }>
  available_sizes: string[]
  best_sellers: Array<{
    product_id: string
    name: { fr: string; en: string }
    reference: string
    club_name: string | null
    qty: number
    revenue: number
    margin: number
  }>
}

const stats = ref<StatsPayload | null>(null)
const loading = ref(false)
const errorMsg = ref<string | null>(null)

async function fetchStats() {
  loading.value = true
  errorMsg.value = null
  try {
    const { data, error } = await invokeEdge<StatsPayload>('admin-stats', {
      method: 'POST',
      body: {
        period: period.value,
        club_id: clubId.value,
        category: category.value,
        product_id: productId.value,
        size: size.value,
        reference: reference.value.trim() || null,
      },
    })
    if (error) throw new Error(error.message)
    stats.value = data ?? null
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.errors.generic')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([clubs.fetchAll(), products.fetchAll(), fetchStats()])
})

watch([period, clubId, category, productId, size], () => fetchStats())
let refTimer: ReturnType<typeof setTimeout> | null = null
watch(reference, () => {
  if (refTimer) clearTimeout(refTimer)
  refTimer = setTimeout(fetchStats, 300)
})

const categories = computed(() =>
  Array.from(new Set(products.items.map((p) => p.category).filter(Boolean) as string[])).sort(),
)

// * When a product is picked, surface its full variant size list (the
// * server's available_sizes is derived from sold items, so unsold sizes
// * would otherwise be missing from the filter).
const availableSizes = computed<string[]>(() => {
  if (productId.value) {
    const p = products.byId(productId.value)
    if (p) {
      return Array.from(new Set(p.variants.map((v) => v.size).filter(Boolean))).sort()
    }
  }
  return stats.value?.available_sizes ?? []
})

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

const kpis = computed(() => {
  const k = stats.value?.kpis
  return [
    { label: t('admin.stats.kpi.revenue'), value: k ? fmt(k.revenue) : '—', accent: 'primary' as const },
    { label: t('admin.stats.kpi.margin'), value: k ? fmt(k.margin) : '—', accent: 'green' as const },
    { label: t('admin.stats.kpi.orders'), value: String(k?.orders ?? 0), accent: 'purple' as const },
    { label: t('admin.stats.kpi.averageBasket'), value: k ? fmt(k.average_basket) : '—', accent: 'primary' as const },
    { label: t('admin.stats.kpi.activeProducts'), value: String(k?.active_products ?? 0), hint: t('admin.stats.kpi.totalFund') + ': ' + (k ? fmt(k.total_fund) : '—'), accent: 'gold' as const },
  ]
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="font-heading text-2xl font-bold">{{ t('admin.stats.title') }}</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.stats.subtitle') }}</p>
    </div>

    <ClientOnly>
      <AdminStatsFiltersBar
        :period="period"
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
        @update:club-id="(v) => (clubId = v)"
        @update:category="(v) => (category = v)"
        @update:product-id="(v) => (productId = v)"
        @update:size="(v) => (size = v)"
        @update:reference="(v) => (reference = v)"
      />

      <AdminStatsKpiRow :kpis="kpis" />

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>
      <div v-if="loading && !stats" class="p-10 text-center text-gray-500">
        {{ t('common.loading') }}
      </div>

      <template v-if="stats">
        <AdminStatsRevenueChart :series="stats.revenue_series" />

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <AdminStatsSportDonut :data="stats.revenue_by_sport" />
          <AdminStatsSizeBreakdown :data="stats.size_breakdown" />
        </div>

        <AdminStatsBestSellers :rows="stats.best_sellers" />
      </template>
    </ClientOnly>
  </div>
</template>
