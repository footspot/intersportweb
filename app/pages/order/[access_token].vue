<script setup lang="ts">
// * Public order detail. Auth optional — the magic-link `access_token` in the
// * URL is the credential. Fetches via the SECURITY DEFINER RPC
// * `get_order_by_token` so the row never has to be readable directly.

definePageMeta({ ssr: false })

const route = useRoute()
const accessToken = computed(() => String(route.params.access_token))

const { t } = useI18n()
const client = useSupabaseClient()

interface OrderItem {
  id: string
  product_id: string
  variant_id: string | null
  quantity: number
  size: string
  secondary_size: string | null
  // * Per-product (independent axis) sizes for bundles, e.g. ball size.
  component_sizes: { name: { fr?: string; en?: string }; size: string }[]
  color: string | null
  selected_options: { name: string; price: number; value?: string | null }[]
  unit_price_paid: number
  status: string
  flocking_name: string | null
  flocking_initial: string | null
  flocking_number: string | null
  product: { name: { fr?: string; en?: string }; image_path: string | null; reference: string }
}
interface PickupShop {
  name: string
  address: string
  postal_code: string
  city: string
}
interface Order {
  id: string
  order_number: string
  status: string
  total: number
  subtotal: number
  shipping_cost: number
  refund_total: number
  payment_method: string | null
  delivery_method: string
  shipping_tracking: string | null
  shipping_address: any
  paid_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  picked_up_at: string | null
  ready_for_pickup_at: string | null
  created_at: string
  guest_email: string | null
  items: OrderItem[]
  refunds: any[]
  club: { name: string } | null
  pickup_shop: PickupShop | null
  access_token: string
}

const order = ref<Order | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)

async function fetchOrder() {
  loading.value = true
  error.value = null
  try {
    const { data, error: rpcErr } = await client.rpc('get_order_by_token', {
      p_token: accessToken.value,
    })
    if (rpcErr) {
      console.error('[order-page] get_order_by_token failed', rpcErr)
      error.value = t('publicOrder.tokenInvalid')
    } else if (!data) {
      error.value = t('publicOrder.notFound')
    } else {
      order.value = data as Order
    }
  } catch (e) {
    console.error('[order-page]', e)
    error.value = t('publicOrder.tokenInvalid')
  } finally {
    loading.value = false
  }
}

onMounted(fetchOrder)
// * Re-fetch shortly after mount so the buyer sees status='paid' as soon as
// * the IPN lands (usually within 2–5 s of the post-pay redirect).
onMounted(() => {
  const retries = [3000, 8000]
  for (const ms of retries) setTimeout(() => { if (order.value?.status === 'pending') fetchOrder() }, ms)
})

function fmt(v: number | string | null | undefined) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
}
function imageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}
const trackingUrl = computed(() => {
  const c = order.value?.shipping_tracking?.trim()
  return c ? `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(c)}` : ''
})

const deliveryLabel = computed(() => {
  const m = order.value?.delivery_method
  if (m === 'colissimo') return t('checkout.delivery.colissimo')
  if (m === 'club_pickup') return t('checkout.delivery.clubPickup')
  if (m === 'shop_pickup') return t('checkout.delivery.shopPickup')
  return ''
})

const paymentLabel = computed(() => {
  const p = order.value?.payment_method
  if (p === 'card') return t('checkout.payment.card')
  if (p === 'paypal') return 'PayPal'
  if (p === 'prepaid') return t('publicOrder.paymentPrepaid')
  if (p === 'free') return t('publicOrder.paymentFree')
  return '—'
})

interface TimelineStep {
  key: string
  label: string
  reached: boolean
  current: boolean
  at?: string | null
}

const timeline = computed<TimelineStep[]>(() => {
  if (!order.value) return []
  const o = order.value
  const m = o.delivery_method
  const status = o.status
  const order_states_colissimo = ['paid', 'shipped', 'delivered']
  const order_states_pickup = ['paid', 'awaiting_pickup', 'picked_up']
  const states = m === 'colissimo' ? order_states_colissimo : order_states_pickup
  const idx = states.indexOf(status)
  // * 'cancelled' / 'refunded' are terminal off-path states — render minimal.
  if (status === 'cancelled' || status === 'refunded' || status === 'partially_refunded') {
    return [
      { key: 'paid', label: t(`publicOrder.timeline.paid`), reached: !!o.paid_at, current: false, at: o.paid_at },
      { key: status, label: t(`publicOrder.timeline.${status}`), reached: true, current: true },
    ]
  }
  return states.map((s, i) => ({
    key: s,
    label: t(`publicOrder.timeline.${s}`),
    reached: idx >= 0 && i <= idx,
    current: i === idx,
    at:
      s === 'paid' ? o.paid_at
      : s === 'shipped' ? o.shipped_at
      : s === 'delivered' ? o.delivered_at
      : s === 'awaiting_pickup' ? o.ready_for_pickup_at
      : s === 'picked_up' ? o.picked_up_at
      : null,
  }))
})

</script>

<template>
  <section class="max-w-4xl mx-auto px-4 py-10 space-y-6">
    <div v-if="loading" class="p-10 text-center text-gray-400">
      <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin mx-auto" />
    </div>
    <div v-else-if="error" class="bg-brand-secondary/10 border border-brand-secondary/30 rounded-card p-6 text-sm text-brand-secondary">
      {{ error }}
    </div>
    <template v-else-if="order">
      <header class="space-y-1">
        <h1 class="font-heading text-2xl font-bold">{{ t('publicOrder.thanks') }}</h1>
        <p class="text-sm text-gray-500">{{ t('publicOrder.orderNumber') }} <span class="font-mono">{{ order.order_number }}</span></p>
        <p class="text-xs text-gray-400">{{ t('publicOrder.saveThisPage') }}</p>
      </header>

      <!-- Status timeline -->
      <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5">
        <h2 class="font-heading font-bold mb-3">{{ t('publicOrder.status') }}</h2>
        <ol class="flex items-center justify-between gap-2">
          <li v-for="(step, i) in timeline" :key="step.key" class="flex-1 text-center">
            <div
              class="w-8 h-8 mx-auto rounded-full inline-flex items-center justify-center text-xs"
              :class="step.reached ? 'bg-brand-primary text-white' : 'bg-gray-200 text-gray-500'"
            >
              {{ i + 1 }}
            </div>
            <div class="text-xs mt-2" :class="step.current ? 'font-semibold text-brand-primary' : 'text-gray-600'">
              {{ step.label }}
            </div>
            <div v-if="step.at" class="text-[10px] text-gray-400 mt-1">{{ fmtDate(step.at) }}</div>
          </li>
        </ol>
      </div>

      <!-- Tracking / pickup info -->
      <div v-if="order.delivery_method === 'colissimo' && trackingUrl" class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5">
        <h2 class="font-heading font-bold mb-2">{{ t('publicOrder.tracking') }}</h2>
        <p class="text-sm mb-2 font-mono">{{ order.shipping_tracking }}</p>
        <a :href="trackingUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-brand-primary hover:underline text-sm">
          <UIcon name="i-lucide-external-link" class="w-3 h-3" />
          {{ t('publicOrder.trackParcel') }}
        </a>
      </div>

      <div v-else-if="order.pickup_shop" class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5">
        <h2 class="font-heading font-bold mb-2">{{ t('publicOrder.pickupAt') }}</h2>
        <p class="text-sm font-semibold">{{ order.pickup_shop.name }}</p>
        <p class="text-xs text-gray-500">
          {{ order.pickup_shop.address }} · {{ order.pickup_shop.postal_code }} {{ order.pickup_shop.city }}
        </p>
      </div>

      <div v-else-if="order.delivery_method === 'club_pickup' && order.club" class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5">
        <h2 class="font-heading font-bold mb-2">{{ t('publicOrder.pickupAt') }}</h2>
        <p class="text-sm font-semibold">{{ order.club.name }}</p>
      </div>

      <!-- Items -->
      <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5">
        <h2 class="font-heading font-bold mb-3">{{ t('publicOrder.items') }}</h2>
        <ul class="divide-y divide-gray-100 dark:divide-sidebar">
          <li v-for="it in order.items" :key="it.id" class="py-3 flex gap-3 text-sm" :class="it.status === 'refunded_oos' ? 'opacity-60' : ''">
            <img v-if="imageUrl(it.product?.image_path)" :src="imageUrl(it.product?.image_path)!" alt="" class="w-14 h-14 object-cover rounded" />
            <div class="flex-1 min-w-0">
              <p class="font-medium truncate">{{ it.product?.name?.fr ?? it.product?.reference }}</p>
              <p class="text-xs text-gray-500"><template v-if="it.color">{{ it.color }} · </template>{{ it.size }}<template v-if="it.secondary_size"> / {{ it.secondary_size }}</template><template v-for="(c, ci) in (it.component_sizes ?? [])" :key="ci"> · {{ c.name?.fr }} : {{ c.size }}</template> · ×{{ it.quantity }}</p>
              <p v-if="it.flocking_name || it.flocking_initial || it.flocking_number" class="text-xs text-gray-500">
                {{ [it.flocking_name, it.flocking_initial, it.flocking_number].filter(Boolean).join(' · ') }}
              </p>
              <p v-if="it.selected_options?.length" class="text-xs text-gray-500">
                + {{ it.selected_options.map((o) => (o.value ? `${o.name} : ${o.value}` : o.name)).join(', ') }}
              </p>
            </div>
            <p class="font-medium">{{ fmt(it.unit_price_paid * it.quantity) }}</p>
          </li>
        </ul>

        <div class="mt-4 pt-3 border-t border-gray-100 dark:border-sidebar text-sm space-y-1">
          <div class="flex justify-between text-gray-600"><span>{{ t('publicOrder.subtotal') }}</span><span>{{ fmt(order.subtotal) }}</span></div>
          <div class="flex justify-between text-gray-600"><span>{{ t('publicOrder.shipping') }}</span><span>{{ fmt(order.shipping_cost) }}</span></div>
          <div v-if="Number(order.refund_total) > 0" class="flex justify-between text-brand-secondary"><span>{{ t('publicOrder.refunds') }}</span><span>-{{ fmt(order.refund_total) }}</span></div>
          <div class="flex justify-between font-bold pt-2 border-t border-gray-100 dark:border-sidebar"><span>{{ t('publicOrder.total') }}</span><span>{{ fmt(order.total) }}</span></div>
        </div>

        <div class="flex flex-wrap gap-4 text-xs text-gray-500 mt-3">
          <div><span class="text-gray-400">{{ t('publicOrder.placedOn') }}:</span> {{ fmtDate(order.created_at) }}</div>
          <div><span class="text-gray-400">{{ t('publicOrder.deliveryMethod') }}:</span> {{ deliveryLabel }}</div>
          <div><span class="text-gray-400">{{ t('publicOrder.paymentMethod') }}:</span> {{ paymentLabel }}</div>
        </div>
      </div>

    </template>
  </section>
</template>
