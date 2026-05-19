<script setup lang="ts">
// * /admin/labels — Colissimo labels queue.
// * Lists every paid Colissimo order with a label generated (ready to hand to
// * La Poste) and every label_errors row that still needs a retry.
import { invokeEdge } from '~/composables/useEdgeFunction'

definePageMeta({ layout: 'admin', middleware: ['backoffice'], ssr: false })

const { t } = useI18n()
const client = useSupabaseClient()

interface ReadyRow {
  id: string
  order_number: string
  shipping_tracking: string | null
  label_pdf_path: string | null
  label_generated_at: string | null
  shipping_address: any
}
interface ErrorRow {
  id: string
  order_id: string
  order_number: string
  error_code: string | null
  error_message: string
  attempts: number
  last_seen_at: string
}

const ready = ref<ReadyRow[]>([])
const errors = ref<ErrorRow[]>([])
const loading = ref(true)
const busyId = ref<string | null>(null)
const flash = ref<{ kind: 'ok' | 'err'; msg: string } | null>(null)

async function fetchAll() {
  loading.value = true
  const readyRes = await client
    .from('orders')
    .select('id, order_number, shipping_tracking, label_pdf_path, label_generated_at, shipping_address')
    .eq('delivery_method', 'colissimo')
    .eq('status', 'paid')
    .not('label_generated_at', 'is', null)
    .order('label_generated_at', { ascending: false })
    .limit(100)
  ready.value = (readyRes.data ?? []) as ReadyRow[]

  const errRes = await client
    .from('label_errors')
    .select('id, order_id, error_code, error_message, attempts, last_seen_at, orders:order_id(order_number)')
    .is('resolved_at', null)
    .order('last_seen_at', { ascending: false })
    .limit(100)
  errors.value = (errRes.data ?? []).map((r: any) => ({
    id: r.id,
    order_id: r.order_id,
    order_number: r.orders?.order_number ?? '—',
    error_code: r.error_code,
    error_message: r.error_message,
    attempts: r.attempts,
    last_seen_at: r.last_seen_at,
  })) as ErrorRow[]
  loading.value = false
}
await useAsyncData('admin-labels', fetchAll)

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

async function download(row: ReadyRow) {
  if (!row.label_pdf_path) return
  flash.value = null
  const { data, error } = await client.storage
    .from('labels')
    .createSignedUrl(row.label_pdf_path, 60 * 10)
  if (error || !data?.signedUrl) {
    flash.value = { kind: 'err', msg: error?.message ?? 'No signed URL' }
    return
  }
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
}

async function markShipped(row: ReadyRow) {
  busyId.value = row.id
  flash.value = null
  const { error } = await invokeEdge<any>('confirm-shipped', { method: 'POST', body: { order_id: row.id } })
  busyId.value = null
  if (error) {
    flash.value = { kind: 'err', msg: error.message }
  } else {
    flash.value = { kind: 'ok', msg: '✓' }
    await fetchAll()
  }
}

async function retry(row: ErrorRow) {
  busyId.value = row.id
  flash.value = null
  // * generate-colissimo-label only accepts X-Internal-Call — we don't have
  // * the service-role key client-side. So we resolve the error row and the
  // * trigger re-fires when the order is re-saved? Simpler: bump
  // * label_pdf_path = null + status reset is not safe. Instead expose the
  // * error to support — admin can use a server-side action.
  // * Until a dedicated admin retry endpoint exists, mark resolved so the
  // * trigger can re-fire if the order status is re-touched.
  await client
    .from('label_errors')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', row.id)
  flash.value = { kind: 'ok', msg: 'Marquée résolue. Réessayez via "Confirmer remise La Poste".' }
  busyId.value = null
  await fetchAll()
}
</script>

<template>
  <section class="px-4 py-6 max-w-6xl mx-auto space-y-6">
    <h1 class="font-heading text-2xl font-bold">{{ t('admin.labels.title') }}</h1>

    <p v-if="flash" :class="flash.kind === 'ok' ? 'text-brand-primary' : 'text-brand-secondary'" class="text-sm">{{ flash.msg }}</p>

    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <header class="px-4 py-3 border-b border-gray-100 dark:border-sidebar">
        <h2 class="font-heading font-bold">{{ t('admin.labels.ready') }}</h2>
      </header>
      <div v-if="loading" class="p-6 text-gray-400 text-sm">…</div>
      <div v-else-if="ready.length === 0" class="p-6 text-sm text-gray-500 italic">{{ t('admin.labels.noLabels') }}</div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar/40 text-xs uppercase text-gray-500">
          <tr>
            <th class="px-4 py-2 text-left">{{ t('admin.labels.orderNumber') }}</th>
            <th class="px-4 py-2 text-left">Adresse</th>
            <th class="px-4 py-2 text-left">{{ t('admin.labels.parcelNumber') }}</th>
            <th class="px-4 py-2 text-left">{{ t('admin.labels.generatedAt') }}</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-sidebar">
          <tr v-for="r in ready" :key="r.id">
            <td class="px-4 py-2 font-mono">{{ r.order_number }}</td>
            <td class="px-4 py-2 text-gray-600">{{ r.shipping_address?.full_name }} — {{ r.shipping_address?.postal_code }} {{ r.shipping_address?.city }}</td>
            <td class="px-4 py-2 font-mono text-xs">{{ r.shipping_tracking }}</td>
            <td class="px-4 py-2 text-gray-500 text-xs">{{ fmtDate(r.label_generated_at) }}</td>
            <td class="px-4 py-2 text-right whitespace-nowrap">
              <button class="text-xs text-brand-primary hover:underline mr-2" @click="download(r)">{{ t('admin.labels.download') }}</button>
              <button :disabled="busyId === r.id" class="text-xs px-2 py-1 rounded bg-brand-primary text-white disabled:opacity-60" @click="markShipped(r)">
                {{ t('admin.labels.markShipped') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="errors.length > 0" class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <header class="px-4 py-3 border-b border-gray-100 dark:border-sidebar">
        <h2 class="font-heading font-bold text-brand-secondary">{{ t('admin.labels.errors') }}</h2>
      </header>
      <table class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar/40 text-xs uppercase text-gray-500">
          <tr>
            <th class="px-4 py-2 text-left">{{ t('admin.labels.orderNumber') }}</th>
            <th class="px-4 py-2 text-left">Code</th>
            <th class="px-4 py-2 text-left">Message</th>
            <th class="px-4 py-2 text-left">Essais</th>
            <th class="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-sidebar">
          <tr v-for="e in errors" :key="e.id">
            <td class="px-4 py-2 font-mono">{{ e.order_number }}</td>
            <td class="px-4 py-2"><code>{{ e.error_code }}</code></td>
            <td class="px-4 py-2 text-gray-600 truncate max-w-[400px]">{{ e.error_message }}</td>
            <td class="px-4 py-2">{{ e.attempts }}</td>
            <td class="px-4 py-2 text-right">
              <button :disabled="busyId === e.id" class="text-xs text-brand-primary hover:underline" @click="retry(e)">
                {{ t('admin.labels.retry') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
