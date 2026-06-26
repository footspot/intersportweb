<script setup lang="ts">
// * Customer order history. Lists every order placed under the signed-in
// * account's email (matched server-side by get_my_orders) and links to the
// * existing public order page for full details + live tracking.
definePageMeta({ ssr: false, middleware: 'customer-only' })

const { t } = useI18n()
const client = useSupabaseClient()
const auth = useAuthStore()

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

function fmt(v: number | string | null | undefined) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' })
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

async function signOut() {
  await auth.signOut()
}
</script>

<template>
  <section class="max-w-3xl mx-auto px-4 py-10 space-y-6">
    <header class="flex items-center justify-between gap-3">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('account.history.title') }}</h1>
        <p class="text-sm text-gray-500">{{ auth.profile?.email }}</p>
      </div>
      <button
        type="button"
        class="text-sm text-gray-500 hover:text-brand-secondary inline-flex items-center gap-1"
        @click="signOut"
      >
        <UIcon name="i-lucide-log-out" class="w-4 h-4" />
        {{ t('nav.logout') }}
      </button>
    </header>

    <div v-if="loading" class="p-10 text-center text-gray-400">
      <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin mx-auto" />
    </div>

    <div v-else-if="error" class="bg-brand-secondary/10 border border-brand-secondary/30 rounded-card p-6 text-sm text-brand-secondary">
      {{ error }}
    </div>

    <div v-else-if="!orders.length" class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-10 text-center text-gray-500">
      <UIcon name="i-lucide-package-open" class="w-8 h-8 mx-auto mb-2 text-gray-300" />
      <p>{{ t('account.history.empty') }}</p>
      <NuxtLink to="/" class="inline-block mt-3 text-sm text-brand-primary hover:underline">
        {{ t('account.history.browse') }}
      </NuxtLink>
    </div>

    <ul v-else class="space-y-3">
      <li
        v-for="o in orders"
        :key="o.id"
        class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4 flex items-center justify-between gap-4"
      >
        <div class="min-w-0">
          <p class="font-mono text-sm font-semibold truncate">{{ o.order_number }}</p>
          <p class="text-xs text-gray-500">{{ fmtDate(o.created_at) }} · {{ fmt(o.total) }}</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span class="text-[11px] px-2 py-0.5 rounded-full font-medium" :class="statusClass(o.status)">
            {{ statusLabel(o.status) }}
          </span>
          <NuxtLink
            :to="`/order/${o.access_token}`"
            class="text-sm text-brand-primary hover:underline inline-flex items-center gap-1"
          >
            {{ t('account.history.view') }}
            <UIcon name="i-lucide-chevron-right" class="w-4 h-4" />
          </NuxtLink>
        </div>
      </li>
    </ul>
  </section>
</template>
