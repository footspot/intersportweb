<script setup lang="ts">
// * /admin/stats — analytics dashboard. Admin only.
// * Sends filter payload to admin-stats; server returns pre-aggregated JSON.
import { useClubsStore } from '~/stores/clubs'
import { useProductsStore } from '~/stores/products'
import { invokeEdge } from '~/composables/useEdgeFunction'
import { buildClubStatsPdf, downloadClubStatsPdf } from '~/composables/useClubStatsPdf'
import type { Period } from '~/components/admin/FiltersBar.vue'

definePageMeta({ layout: 'admin', middleware: ['admin'] })

const { t, locale } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const clubs = useClubsStore()
const products = useProductsStore()
const supabase = useSupabaseClient()

const period = ref<Period>('7d')

// * Custom range ('YYYY-MM-DD'), prefilled with the last 30 days so picking
// * "custom" shows data immediately.
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
  size_breakdown: Array<{ size: string | null; qty: number }>
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
  // * Custom period needs both bounds before it's worth a round-trip.
  if (period.value === 'custom' && (!dateFrom.value || !dateTo.value)) return
  loading.value = true
  errorMsg.value = null
  try {
    const { data, error } = await invokeEdge<StatsPayload>('admin-stats', {
      method: 'POST',
      body: {
        period: period.value,
        date_from: period.value === 'custom' ? dateFrom.value : null,
        date_to: period.value === 'custom' ? dateTo.value : null,
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
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([clubs.fetchAll(), products.fetchAll(), fetchStats()])
})

watch([period, dateFrom, dateTo, clubId, category, productId, size], () => fetchStats())
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

// ────────────────────────────── PDF export ──────────────────────────────────
// * Clubs periodically ask for their figures as a file. The PDF is built from
// * `stats` — exactly what admin-stats returned for the filters on screen — so
// * the document can never disagree with the dashboard.
const pdfBusy = ref(false)

function clubLogoUrl(id: string | null): string | null {
  const c = clubs.items.find((x) => x.id === id)
  if (!c?.logo_path) return null
  const { data } = supabase.storage.from('club-logos').getPublicUrl(c.logo_path)
  return data?.publicUrl ?? null
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function localised(n: { fr: string; en: string } | null | undefined): string {
  if (!n) return ''
  return (locale.value === 'en' ? n.en : n.fr) || n.fr || n.en || ''
}

// ! A report narrowed to one category / product / size would otherwise look
// ! like the club's full figures. Print the active filters so the scope of the
// ! document is always explicit on the page.
const activeFiltersLabel = computed<string | null>(() => {
  const parts: string[] = []
  if (category.value) parts.push(`${t('admin.filters.category')}: ${category.value}`)
  if (productId.value) {
    const p = products.byId(productId.value)
    parts.push(`${t('admin.filters.product')}: ${p ? localised(p.name) || p.reference : productId.value}`)
  }
  if (size.value) parts.push(`${t('admin.filters.size')}: ${size.value}`)
  if (reference.value.trim()) parts.push(`${t('admin.filters.reference')}: ${reference.value.trim()}`)
  return parts.length ? parts.join(' - ') : null
})

function fileSlug(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'export'
}

async function exportPdf() {
  if (!stats.value) return
  pdfBusy.value = true
  errorMsg.value = null
  try {
    const club = clubId.value ? clubs.items.find((c) => c.id === clubId.value) ?? null : null
    const dtf = new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'fr-FR', {
      dateStyle: 'long',
      timeStyle: 'short',
    })
    const blob = await buildClubStatsPdf({
      intersportLogoUrl: '/logo_horizontal.svg',
      clubLogoUrl: clubLogoUrl(clubId.value),
      clubName: club?.name ?? null,
      periodLabel: t(`admin.filters.${period.value}`),
      rangeLabel:
        period.value === 'custom' ? `${fmtDay(dateFrom.value)} - ${fmtDay(dateTo.value)}` : null,
      generatedAtLabel: dtf.format(new Date()),
      activeFiltersLabel: activeFiltersLabel.value,
      kpis: stats.value.kpis,
      revenueSeries: stats.value.revenue_series,
      revenueBySport: stats.value.revenue_by_sport,
      sizeBreakdown: stats.value.size_breakdown,
      bestSellers: stats.value.best_sellers.map((b) => ({
        name: localised(b.name),
        reference: b.reference,
        clubName: b.club_name,
        qty: b.qty,
        revenue: b.revenue,
        margin: b.margin,
      })),
      i18n: {
        title: t('admin.stats.title'),
        allClubs: t('admin.stats.pdf.allClubs'),
        period: t('admin.filters.period'),
        range: t('admin.stats.pdf.range'),
        filters: t('admin.stats.pdf.filters'),
        generatedAt: t('admin.stats.pdf.generatedAt'),
        kpiRevenue: t('admin.stats.kpi.revenue'),
        kpiMargin: t('admin.stats.kpi.margin'),
        kpiOrders: t('admin.stats.kpi.orders'),
        kpiAverageBasket: t('admin.stats.kpi.averageBasket'),
        kpiActiveProducts: t('admin.stats.kpi.activeProducts'),
        kpiTotalFund: t('admin.stats.kpi.totalFund'),
        chartTitle: t('admin.stats.revenueChart'),
        legendRevenue: t('admin.stats.revenue'),
        legendMargin: t('admin.stats.margin'),
        bestSellers: t('admin.stats.bestSellers'),
        colProduct: t('admin.stats.col.product'),
        colReference: t('admin.stats.pdf.colReference'),
        colClub: t('admin.stats.col.club'),
        colQty: t('admin.stats.col.qty'),
        colRevenue: t('admin.stats.col.revenue'),
        colMargin: t('admin.stats.col.margin'),
        sportTitle: t('admin.stats.sportDonut'),
        colSport: t('admin.stats.pdf.colSport'),
        sizeTitle: t('admin.stats.sizeBreakdown'),
        colSize: t('admin.stats.pdf.colSize'),
        uniqueSize: t('admin.stats.uniqueSize'),
        total: t('admin.stats.total'),
        noData: t('admin.stats.noData'),
        page: t('admin.stats.pdf.page'),
        confidential: t('admin.stats.pdf.confidential'),
      },
    })
    const name = club?.name ?? t('admin.stats.pdf.allClubs')
    downloadClubStatsPdf(
      blob,
      `statistiques-${fileSlug(name)}-${new Date().toISOString().slice(0, 10)}.pdf`,
    )
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    pdfBusy.value = false
  }
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
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.stats.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.stats.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!stats || loading || pdfBusy"
        :title="t('admin.stats.pdf.hint')"
        @click="exportPdf"
      >
        {{ pdfBusy ? t('admin.stats.pdf.building') : t('admin.stats.pdf.download') }}
      </button>
    </div>

    <ClientOnly>
      <AdminFiltersBar
        :period="period"
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
