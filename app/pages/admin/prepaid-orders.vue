<script setup lang="ts">
// * /admin/prepaid-orders — Footspot prepaid invoicing report.
// *   Lists every order that consumed a prepaid code. The CSV export is the
// *   basis for the monthly invoice accounting sends to each club.
import { useClubsStore } from '~/stores/clubs'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t, locale } = useI18n()
const clubs = useClubsStore()
const client = useSupabaseClient()

interface PrepaidOrder {
  id: string
  order_number: string
  club_id: string
  status: string
  guest_first_name: string | null
  guest_last_name: string | null
  prepaid_credit: number
  prepaid_club_id: string | null
  total: number
  paid_at: string | null
  delivered_at: string | null
  created_at: string
}

const rows = ref<PrepaidOrder[]>([])
const loading = ref(true)

const filterClub = ref<string>('all')
const filterStatus = ref<string>('all')
const dateFrom = ref<string>('')
const dateTo = ref<string>('')

async function load() {
  loading.value = true
  try {
    const { data, error } = await client
      .from('orders')
      .select('id, order_number, club_id, status, guest_first_name, guest_last_name, prepaid_credit, prepaid_club_id, total, paid_at, delivered_at, created_at')
      .not('prepaid_code_ref', 'is', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    rows.value = (data ?? []) as PrepaidOrder[]
  } finally {
    loading.value = false
  }
}

await useAsyncData('admin-prepaid-orders', async () => {
  await Promise.all([clubs.fetchAll(), load()])
  return true
})

const filtered = computed(() => {
  return rows.value.filter((r) => {
    if (filterClub.value !== 'all' && r.club_id !== filterClub.value) return false
    if (filterStatus.value !== 'all' && r.status !== filterStatus.value) return false
    if (dateFrom.value && (!r.paid_at || r.paid_at < dateFrom.value)) return false
    if (dateTo.value && (!r.paid_at || r.paid_at > `${dateTo.value}T23:59:59`)) return false
    return true
  })
})

const totalPrepaid = computed(() =>
  filtered.value.reduce((s, r) => s + Number(r.prepaid_credit ?? 0), 0),
)
const totalPaid = computed(() =>
  filtered.value.reduce((s, r) => s + Number(r.total ?? 0), 0),
)

function clubName(id: string): string {
  return clubs.items.find((c) => c.id === id)?.name ?? id
}
function memberName(r: PrepaidOrder): string {
  return [r.guest_first_name, r.guest_last_name].filter(Boolean).join(' ') || '—'
}
function fmtEuro(v: number | string | null) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'short' }).format(new Date(iso))
}

function exportCsv() {
  const header = ['Order', 'Member', 'Club', 'Prepaid credit', 'Customer paid', 'Status', 'Paid at', 'Delivered at']
  const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  const lines = [header.map(escape).join(',')]
  for (const r of filtered.value) {
    lines.push([
      r.order_number,
      memberName(r),
      clubName(r.club_id),
      Number(r.prepaid_credit ?? 0).toFixed(2),
      Number(r.total ?? 0).toFixed(2),
      r.status,
      r.paid_at ?? '',
      r.delivered_at ?? '',
    ].map((v) => escape(String(v))).join(','))
  }
  lines.push([escape('TOTAL'), '', '', totalPrepaid.value.toFixed(2), totalPaid.value.toFixed(2), '', '', ''].join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `prepaid-orders-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.prepaidOrders.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.prepaidOrders.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
        :disabled="filtered.length === 0"
        @click="exportCsv"
      >
        <UIcon name="i-lucide-download" class="w-4 h-4" />
        <span>{{ t('admin.prepaidOrders.exportCsv') }}</span>
      </button>
    </div>

    <div class="flex flex-wrap items-end gap-3 bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4">
      <label class="flex items-center gap-2">
        <span class="text-xs text-gray-500">{{ t('admin.prepaidOrders.filter.club') }}</span>
        <select v-model="filterClub" class="px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:outline-none">
          <option value="all">{{ t('admin.prepaidOrders.filter.allClubs') }}</option>
          <option v-for="c in clubs.items" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
      <label class="flex items-center gap-2">
        <span class="text-xs text-gray-500">{{ t('admin.prepaidOrders.filter.status') }}</span>
        <select v-model="filterStatus" class="px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:outline-none">
          <option value="all">{{ t('admin.prepaidOrders.filter.allStatuses') }}</option>
          <option value="paid">paid</option>
          <option value="shipped">shipped</option>
          <option value="delivered">delivered</option>
          <option value="cancelled">cancelled</option>
        </select>
      </label>
      <label class="flex items-center gap-2">
        <span class="text-xs text-gray-500">{{ t('admin.prepaidOrders.filter.from') }}</span>
        <input v-model="dateFrom" type="date" class="px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:outline-none" />
      </label>
      <label class="flex items-center gap-2">
        <span class="text-xs text-gray-500">{{ t('admin.prepaidOrders.filter.to') }}</span>
        <input v-model="dateTo" type="date" class="px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:outline-none" />
      </label>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4">
        <div class="text-xs text-gray-500">{{ t('admin.prepaidOrders.totalPrepaid') }}</div>
        <div class="font-heading text-2xl font-bold text-brand-gold">{{ fmtEuro(totalPrepaid) }}</div>
      </div>
      <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4">
        <div class="text-xs text-gray-500">{{ t('admin.prepaidOrders.totalPaid') }}</div>
        <div class="font-heading text-2xl font-bold">{{ fmtEuro(totalPaid) }}</div>
      </div>
    </div>

    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="loading" class="p-10 text-center text-gray-500">{{ t('common.loading') }}</div>
      <div v-else-if="filtered.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-ticket" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.prepaidOrders.empty') }}</p>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3">{{ t('admin.prepaidOrders.col.order') }}</th>
            <th class="px-4 py-3">{{ t('admin.prepaidOrders.col.member') }}</th>
            <th class="px-4 py-3">{{ t('admin.prepaidOrders.col.club') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.prepaidOrders.col.prepaid') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.prepaidOrders.col.paid') }}</th>
            <th class="px-4 py-3">{{ t('admin.prepaidOrders.col.status') }}</th>
            <th class="px-4 py-3">{{ t('admin.prepaidOrders.col.paidAt') }}</th>
            <th class="px-4 py-3">{{ t('admin.prepaidOrders.col.deliveredAt') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filtered" :key="r.id" class="border-t border-gray-100 dark:border-sidebar">
            <td class="px-4 py-3 font-mono text-xs">{{ r.order_number }}</td>
            <td class="px-4 py-3">{{ memberName(r) }}</td>
            <td class="px-4 py-3">{{ clubName(r.club_id) }}</td>
            <td class="px-4 py-3 text-right text-brand-gold font-medium">{{ fmtEuro(r.prepaid_credit) }}</td>
            <td class="px-4 py-3 text-right">{{ fmtEuro(r.total) }}</td>
            <td class="px-4 py-3 text-xs">{{ r.status }}</td>
            <td class="px-4 py-3 text-xs text-gray-500">{{ fmtDate(r.paid_at) }}</td>
            <td class="px-4 py-3 text-xs text-gray-500">{{ fmtDate(r.delivered_at) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
