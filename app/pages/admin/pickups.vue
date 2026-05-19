<script setup lang="ts">
// * /admin/pickups — manage club_pickup + shop_pickup orders.
// * Two tabs:
// *   - À préparer       : status='paid' AND delivery_method IN ('club_pickup','shop_pickup')
// *   - À retirer        : status='awaiting_pickup'
// *   - Retirés          : status='picked_up' (last 30 days)
import { invokeEdge } from '~/composables/useEdgeFunction'

definePageMeta({ layout: 'admin', middleware: ['backoffice'], ssr: false })

const { t } = useI18n()
const client = useSupabaseClient()

interface PickupRow {
  id: string
  order_number: string
  status: string
  delivery_method: string
  ready_for_pickup_at: string | null
  picked_up_at: string | null
  guest_email: string | null
  guest_first_name: string | null
  guest_last_name: string | null
  shipping_address: any
  club: { name: string } | null
  shop: { name: string; city: string } | null
}

const tab = ref<'prep' | 'awaiting' | 'pickedup'>('prep')
const rows = ref<PickupRow[]>([])
const loading = ref(true)
const busyId = ref<string | null>(null)
const flash = ref<{ kind: 'ok' | 'err'; msg: string } | null>(null)

async function fetchAll() {
  loading.value = true
  let q = client
    .from('orders')
    .select(
      'id, order_number, status, delivery_method, ready_for_pickup_at, picked_up_at, guest_email, guest_first_name, guest_last_name, shipping_address, club:clubs(name), shop:intersport_shops(name, city)',
    )
    .in('delivery_method', ['club_pickup', 'shop_pickup'])

  if (tab.value === 'prep') q = q.eq('status', 'paid')
  else if (tab.value === 'awaiting') q = q.eq('status', 'awaiting_pickup')
  else q = q.eq('status', 'picked_up').order('picked_up_at', { ascending: false })

  const { data } = await q.limit(100)
  rows.value = (data ?? []) as PickupRow[]
  loading.value = false
}
watch(tab, fetchAll)
await useAsyncData('admin-pickups', fetchAll)

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

async function markReady(r: PickupRow) {
  busyId.value = r.id
  flash.value = null
  const { error } = await invokeEdge<any>('mark-ready-for-pickup', { method: 'POST', body: { order_id: r.id } })
  busyId.value = null
  if (error) flash.value = { kind: 'err', msg: error.message }
  else {
    flash.value = { kind: 'ok', msg: '✓' }
    await fetchAll()
  }
}
async function confirmPickup(r: PickupRow) {
  busyId.value = r.id
  flash.value = null
  const { error } = await invokeEdge<any>('confirm-picked-up', { method: 'POST', body: { order_id: r.id } })
  busyId.value = null
  if (error) flash.value = { kind: 'err', msg: error.message }
  else {
    flash.value = { kind: 'ok', msg: '✓' }
    await fetchAll()
  }
}

function customerName(r: PickupRow) {
  if (r.guest_first_name) return `${r.guest_first_name} ${r.guest_last_name ?? ''}`.trim()
  return r.shipping_address?.full_name ?? '—'
}
</script>

<template>
  <section class="px-4 py-6 max-w-6xl mx-auto space-y-4">
    <h1 class="font-heading text-2xl font-bold">{{ t('admin.pickups.title') }}</h1>

    <div class="flex gap-2 text-sm">
      <button :class="tab === 'prep'      ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-600'" class="px-3 py-2 rounded-lg" @click="tab = 'prep'">{{ t('admin.pickups.awaitingPrep') }}</button>
      <button :class="tab === 'awaiting'  ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-600'" class="px-3 py-2 rounded-lg" @click="tab = 'awaiting'">{{ t('admin.pickups.awaitingPickup') }}</button>
      <button :class="tab === 'pickedup'  ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-600'" class="px-3 py-2 rounded-lg" @click="tab = 'pickedup'">{{ t('admin.pickups.pickedUp') }}</button>
    </div>

    <p v-if="flash" :class="flash.kind === 'ok' ? 'text-brand-primary' : 'text-brand-secondary'" class="text-sm">{{ flash.msg }}</p>

    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="loading" class="p-6 text-gray-400 text-sm">…</div>
      <div v-else-if="rows.length === 0" class="p-6 text-sm text-gray-500 italic">{{ t('admin.pickups.noPickups') }}</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar/40 text-xs uppercase text-gray-500">
          <tr>
            <th class="px-4 py-2 text-left">Commande</th>
            <th class="px-4 py-2 text-left">Client</th>
            <th class="px-4 py-2 text-left">Lieu</th>
            <th class="px-4 py-2 text-left">Statut</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-sidebar">
          <tr v-for="r in rows" :key="r.id">
            <td class="px-4 py-2 font-mono">{{ r.order_number }}</td>
            <td class="px-4 py-2">{{ customerName(r) }}<br /><span class="text-xs text-gray-500">{{ r.guest_email }}</span></td>
            <td class="px-4 py-2 text-gray-600">
              <template v-if="r.delivery_method === 'shop_pickup'">
                <UIcon name="i-lucide-store" class="inline w-3 h-3 mr-1 text-brand-primary" />
                {{ r.shop?.name }}<span v-if="r.shop?.city"> ({{ r.shop?.city }})</span>
              </template>
              <template v-else>
                <UIcon name="i-lucide-building" class="inline w-3 h-3 mr-1 text-brand-primary" />
                {{ r.club?.name }}
              </template>
            </td>
            <td class="px-4 py-2 text-xs">
              <template v-if="tab === 'awaiting'">{{ fmtDate(r.ready_for_pickup_at) }}</template>
              <template v-else-if="tab === 'pickedup'">{{ fmtDate(r.picked_up_at) }}</template>
              <template v-else>—</template>
            </td>
            <td class="px-4 py-2 text-right whitespace-nowrap">
              <button v-if="tab === 'prep'" :disabled="busyId === r.id" class="text-xs px-2 py-1 rounded bg-brand-primary text-white disabled:opacity-60" @click="markReady(r)">
                {{ t('admin.pickups.markReady') }}
              </button>
              <button v-else-if="tab === 'awaiting'" :disabled="busyId === r.id" class="text-xs px-2 py-1 rounded bg-brand-primary text-white disabled:opacity-60" @click="confirmPickup(r)">
                {{ t('admin.pickups.confirmPickup') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
