<script setup lang="ts">
// * /admin/fund — Cagnotte grid. Admin only.
import { useClubsStore, type Club } from '~/stores/clubs'
import { useSportsStore } from '~/stores/sports'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t } = useI18n()
const clubs = useClubsStore()
const sports = useSportsStore()

const creditOpen = ref(false)
const debitOpen = ref(false)
const target = ref<Club | null>(null)

const sportFilter = ref<'all' | string>('all')
const search = ref('')

await useAsyncData('admin-fund-page', async () => {
  await Promise.all([sports.fetchAll(), clubs.fetchAll()])
  return true
})

const filteredClubs = computed<Club[]>(() => {
  const q = search.value.trim().toLowerCase()
  return clubs.items.filter((c) => {
    if (sportFilter.value !== 'all' && c.sport_id !== sportFilter.value) return false
    if (q && !c.name.toLowerCase().includes(q)) return false
    return true
  })
})

const totals = computed(() => {
  const all = clubs.items
  const sum = all.reduce((s, c) => s + Number(c.fund_balance ?? 0), 0)
  const positive = all.filter((c) => Number(c.fund_balance) > 0).length
  const negative = all.filter((c) => Number(c.fund_balance) <= 0).length
  return { sum, positive, negative, count: all.length }
})

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

function askCredit(c: Club) {
  target.value = c
  creditOpen.value = true
}
function askDebit(c: Club) {
  target.value = c
  debitOpen.value = true
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.fund.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.fund.subtitle') }}</p>
      </div>
      <div class="relative">
        <input
          v-model="search"
          type="text"
          :placeholder="t('admin.fund.searchPlaceholder')"
          class="pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
        <UIcon name="i-lucide-search" class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
      </div>
    </div>

    <!-- KPI strip -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="p-4 rounded-card bg-white dark:bg-sidebar-surface shadow-card-sm">
        <div class="text-xs uppercase tracking-wider text-gray-500">{{ t('admin.fund.kpi.total') }}</div>
        <div class="font-heading text-2xl font-bold text-brand-primary">{{ fmt(totals.sum) }}</div>
        <div class="text-xs text-gray-500">{{ t('admin.fund.kpi.clubs', { n: totals.count }) }}</div>
      </div>
      <div class="p-4 rounded-card bg-white dark:bg-sidebar-surface shadow-card-sm">
        <div class="text-xs uppercase tracking-wider text-gray-500">{{ t('admin.fund.kpi.active') }}</div>
        <div class="font-heading text-2xl font-bold text-brand-green">{{ totals.positive }}</div>
      </div>
      <div class="p-4 rounded-card bg-white dark:bg-sidebar-surface shadow-card-sm">
        <div class="text-xs uppercase tracking-wider text-gray-500">{{ t('admin.fund.kpi.empty') }}</div>
        <div class="font-heading text-2xl font-bold text-brand-secondary">{{ totals.negative }}</div>
      </div>
    </div>

    <div v-if="sports.sorted.length > 1" class="flex flex-wrap gap-2">
      <button
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium"
        :class="sportFilter === 'all' ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="sportFilter = 'all'"
      >
        {{ t('admin.fund.filterAll') }}
      </button>
      <button
        v-for="s in sports.sorted"
        :key="s.id"
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium"
        :class="sportFilter === s.id ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="sportFilter = s.id"
      >
        {{ s.name.fr }}
      </button>
    </div>

    <div v-if="clubs.loading" class="p-10 text-center text-gray-500">
      {{ t('common.loading') }}
    </div>
    <div v-else-if="filteredClubs.length === 0" class="p-10 text-center bg-white dark:bg-sidebar-surface rounded-card">
      <UIcon name="i-lucide-piggy-bank" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p class="text-gray-500">{{ t('admin.fund.empty') }}</p>
    </div>
    <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <AdminFundCagnotteCard
        v-for="c in filteredClubs"
        :key="c.id"
        :club="c"
        :sport="sports.byId(c.sport_id)"
        @credit="askCredit"
        @debit="askDebit"
      />
    </div>

    <AdminFundCreditModal v-model="creditOpen" :club="target" />
    <AdminFundDebitModal v-model="debitOpen" :club="target" />
  </div>
</template>
