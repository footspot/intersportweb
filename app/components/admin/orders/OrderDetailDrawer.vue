<script setup lang="ts">
// * Right-side drawer for a full order: items, pricing snapshot, flocking,
// * fund credited, refund history, and status transition buttons.
import { ORDER_TRANSITIONS, type Order, type OrderStatus } from '~/stores/orders'
import { useOrdersStore } from '~/stores/orders'
import { invokeEdge } from '~/composables/useEdgeFunction'

interface Props {
  modelValue: boolean
  orderId: string | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
}>()

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const orders = useOrdersStore()
const client = useSupabaseClient()

const detail = ref<Order | null>(null)
const loading = ref(false)
const updating = ref(false)

watch(
  () => [props.modelValue, props.orderId],
  async () => {
    if (!props.modelValue || !props.orderId) return
    loading.value = true
    try {
      detail.value = await orders.fetchDetail(props.orderId)
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

function close() {
  emit('update:modelValue', false)
}

function fmt(v: number | string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

const totalWeightGrams = computed(() =>
  (detail.value?.items ?? []).reduce(
    (sum, it) => sum + (Number(it.product?.weight_grams ?? 0) * it.quantity),
    0,
  ),
)
const totalWeightLabel = computed(() => {
  const g = totalWeightGrams.value
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`
  return `${g} g`
})

function imageUrl(path: string | null | undefined) {
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}

const nextStatuses = computed<OrderStatus[]>(() => {
  const s = detail.value?.status
  return s ? ORDER_TRANSITIONS[s] ?? [] : []
})

const invoiceLoading = ref(false)
const invoiceError = ref<string | null>(null)

async function downloadInvoice() {
  if (!detail.value) return
  invoiceLoading.value = true
  invoiceError.value = null
  try {
    const { data, error } = await invokeEdge<{ signed_url: string }>('generate-invoice', {
      method: 'POST',
      body: { order_id: detail.value.id, locale: 'fr' },
    })
    if (error) throw new Error(error.message)
    if (data?.signed_url) window.open(data.signed_url, '_blank')
  } catch (err) {
    invoiceError.value = edgeErrorMessage(err)
  } finally {
    invoiceLoading.value = false
  }
}

const canDownloadInvoice = computed(() => {
  const s = detail.value?.status
  return s && ['paid', 'partially_refunded', 'shipped', 'delivered', 'refunded'].includes(s)
})

// * Bon de commande — internal picking PDF (items + flocking/options + delivery).
const purchaseOrderLoading = ref(false)
const purchaseOrderError = ref<string | null>(null)

async function downloadPurchaseOrder() {
  if (!detail.value) return
  purchaseOrderLoading.value = true
  purchaseOrderError.value = null
  try {
    const { data, error } = await invokeEdge<{ signed_url: string }>('generate-purchase-order', {
      method: 'POST',
      body: { order_id: detail.value.id, locale: 'fr' },
    })
    if (error) throw new Error(error.message)
    if (data?.signed_url) window.open(data.signed_url, '_blank')
  } catch (err) {
    purchaseOrderError.value = edgeErrorMessage(err)
  } finally {
    purchaseOrderLoading.value = false
  }
}

// * Delivery address block — shape depends on the delivery method.
const deliveryAddressLines = computed<string[]>(() => {
  const o = detail.value
  if (!o) return []
  if (o.delivery_method === 'colissimo') {
    const a = o.shipping_address ?? {}
    return [
      a.full_name,
      a.line1,
      a.line2,
      `${a.postal_code ?? ''} ${a.city ?? ''}`.trim(),
      a.country,
      a.phone,
    ].filter(Boolean)
  }
  if (o.delivery_method === 'shop_pickup' && o.shop) {
    return [
      o.shop.name,
      o.shop.address,
      `${o.shop.postal_code ?? ''} ${o.shop.city ?? ''}`.trim(),
      o.shop.phone,
    ].filter(Boolean) as string[]
  }
  // * club_pickup — the club itself is the pickup point.
  return [o.club?.name].filter(Boolean) as string[]
})

const labelLoading = ref(false)
const labelError = ref<string | null>(null)
async function openLabel() {
  if (!detail.value?.label_pdf_path) return
  labelLoading.value = true
  labelError.value = null
  try {
    const { data, error } = await client.storage
      .from('labels')
      .createSignedUrl(detail.value.label_pdf_path, 60 * 10)
    if (error || !data?.signedUrl) {
      throw new Error(error?.message ?? 'no signed url')
    }
    // * Open in a new tab — browser's native PDF viewer exposes Save + Print.
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  } catch (err) {
    labelError.value = edgeErrorMessage(err)
  } finally {
    labelLoading.value = false
  }
}

// * Pick a target status — opens the confirmation modal before applying.
const confirmStatus = ref<OrderStatus | null>(null)

function chooseStatus(status: OrderStatus) {
  confirmStatus.value = status
}

async function applyStatus() {
  if (!detail.value || !confirmStatus.value) return
  updating.value = true
  try {
    await orders.setStatus(detail.value.id, confirmStatus.value)
    detail.value = await orders.fetchDetail(detail.value.id, true)
    confirmStatus.value = null
  } finally {
    updating.value = false
  }
}

const trackingUrl = computed(() => {
  const code = detail.value?.shipping_tracking?.trim()
  if (!code) return ''
  return `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(code)}`
})
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-40 flex">
    <div class="flex-1 bg-black/50" @click="close" />
    <aside class="w-full max-w-xl bg-white dark:bg-sidebar-surface overflow-y-auto shadow-card-lg">
      <div class="sticky top-0 bg-white dark:bg-sidebar-surface border-b border-gray-100 dark:border-sidebar px-6 py-4 flex items-center justify-between z-10">
        <div>
          <div class="font-heading text-lg font-bold">{{ detail?.order_number ?? '…' }}</div>
          <div class="text-xs text-gray-500">{{ fmtDate(detail?.created_at ?? null) }}</div>
        </div>
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
          :aria-label="t('common.cancel')"
          @click="close"
        >
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>

      <div v-if="loading" class="p-6 text-sm text-gray-500">{{ t('common.loading') }}</div>
      <div v-else-if="detail" class="p-6 space-y-6">
        <!-- Client + club -->
        <section class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div class="text-xs text-gray-500">{{ t('admin.orders.detail.client') }}</div>
            <div class="font-medium">{{ [detail.guest_first_name, detail.guest_last_name].filter(Boolean).join(' ') || '—' }}</div>
            <div class="text-xs text-gray-500">{{ detail.guest_email }}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500">{{ t('admin.orders.detail.club') }}</div>
            <div class="font-medium">{{ detail.club?.name || '—' }}</div>
          </div>
        </section>

        <!-- Items -->
        <section>
          <h4 class="font-heading font-bold mb-2">{{ t('admin.orders.detail.items') }}</h4>
          <div class="space-y-3">
            <div
              v-for="it in detail.items ?? []"
              :key="it.id"
              class="flex gap-3 p-3 rounded-lg border border-gray-100 dark:border-sidebar"
              :class="it.status === 'refunded_oos' ? 'opacity-60' : ''"
            >
              <div class="w-14 h-14 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden shrink-0">
                <img v-if="imageUrl(it.product?.images?.find((x) => x.position === 0)?.image_path)" :src="imageUrl(it.product?.images?.find((x) => x.position === 0)?.image_path)!" class="w-full h-full object-cover" alt="" />
                <UIcon v-else name="i-lucide-image" class="w-5 h-5 text-gray-400" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="font-medium truncate">{{ it.product?.name.fr ?? it.product_id }}</div>
                <div class="text-xs text-gray-500">
                  <template v-if="it.color">{{ it.color }} · </template>{{ t('admin.orders.refund.size') }} {{ it.size }}<template v-if="it.secondary_size"> / {{ it.secondary_size }}</template> · ×{{ it.quantity }} · {{ it.product?.reference }}
                </div>
                <div
                  v-for="(c, ci) in (it.components ?? []).filter((x) => x.axis === 'product')"
                  :key="ci"
                  class="text-xs text-gray-500"
                >
                  {{ c.product?.name.fr }} : {{ c.variant?.size }}
                </div>
                <div v-if="it.flocking_name || it.flocking_initial || it.flocking_number" class="text-xs text-brand-primary mt-1">
                  {{ t('admin.orders.detail.flocking') }}:
                  <span v-if="it.flocking_name">{{ it.flocking_name }}</span>
                  <span v-if="it.flocking_initial">· {{ it.flocking_initial }}</span>
                  <span v-if="it.flocking_number">· #{{ it.flocking_number }}</span>
                </div>
                <div v-if="it.selected_options?.length" class="text-xs text-brand-primary mt-1">
                  {{ t('admin.orders.detail.options') }}:
                  {{ it.selected_options.map((o) => (o.value ? `${o.name} : ${o.value}` : o.name)).join(', ') }}
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  {{ t('admin.orders.detail.buying') }}: {{ fmt(it.buying_price_snapshot) }} ·
                  {{ t('admin.orders.detail.fund') }}:
                  <span class="text-brand-green">{{ fmt(Number(it.fund_credit_snapshot) * it.quantity) }}</span>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="font-medium">{{ fmt(Number(it.unit_price_paid) * it.quantity) }}</div>
                <span
                  v-if="it.status === 'refunded_oos'"
                  class="inline-block mt-1 px-2 py-0.5 rounded-full text-xs bg-brand-secondary/10 text-brand-secondary"
                >
                  {{ t('admin.orders.detail.refunded') }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- Totals -->
        <section class="border-t border-gray-100 dark:border-sidebar pt-4 space-y-1 text-sm">
          <div class="flex justify-between"><span class="text-gray-500">{{ t('admin.orders.detail.subtotal') }}</span><span>{{ fmt(detail.subtotal) }}</span></div>
          <div class="flex justify-between"><span class="text-gray-500">{{ t('admin.orders.detail.shipping') }}</span><span>{{ fmt(detail.shipping_cost) }}</span></div>
          <div class="flex justify-between text-brand-primary">
            <span>{{ t('admin.orders.detail.totalWeight') }}</span><span class="font-medium">{{ totalWeightLabel }}</span>
          </div>
          <div v-if="Number(detail.refund_total) > 0" class="flex justify-between text-brand-secondary">
            <span>{{ t('admin.orders.detail.refundTotal') }}</span><span>-{{ fmt(detail.refund_total) }}</span>
          </div>
          <div class="flex justify-between font-heading text-lg font-bold pt-1"><span>{{ t('admin.orders.detail.total') }}</span><span>{{ fmt(detail.total) }}</span></div>
        </section>

        <!-- Delivery method + address -->
        <section class="text-sm space-y-1">
          <h4 class="font-heading font-bold">{{ t('admin.orders.detail.shippingSection') }}</h4>
          <div class="flex items-center gap-1.5 text-brand-primary font-medium">
            <UIcon
              :name="detail.delivery_method === 'colissimo' ? 'i-lucide-truck' : detail.delivery_method === 'club_pickup' ? 'i-lucide-building' : 'i-lucide-store'"
              class="w-4 h-4"
            />
            {{ t(`admin.orders.delivery.${detail.delivery_method}`) }}
          </div>
          <div v-if="deliveryAddressLines.length" class="text-gray-600 dark:text-gray-300">
            <div class="text-xs text-gray-500">{{ t('admin.orders.detail.deliveryAddress') }}</div>
            <div v-for="(l, li) in deliveryAddressLines" :key="li">{{ l }}</div>
          </div>
          <div v-if="detail.shipping_tracking">
            <span class="text-gray-500">{{ t('admin.orders.detail.tracking') }}:</span>
            <a :href="trackingUrl" target="_blank" class="text-brand-primary hover:underline ml-1 font-mono">
              {{ detail.shipping_tracking }}
            </a>
          </div>
          <div v-if="detail.shipped_at" class="text-gray-500">
            {{ t('admin.orders.detail.shippedAt') }}: {{ fmtDate(detail.shipped_at) }}
          </div>
          <div v-if="detail.delivered_at" class="text-gray-500">
            {{ t('admin.orders.detail.deliveredAt') }}: {{ fmtDate(detail.delivered_at) }}
          </div>
        </section>

        <!-- Refunds -->
        <section v-if="(detail.refunds ?? []).length > 0" class="text-sm space-y-2">
          <h4 class="font-heading font-bold">{{ t('admin.orders.detail.refundHistory') }}</h4>
          <div v-for="r in detail.refunds" :key="r.id" class="flex justify-between p-2 rounded-lg bg-gray-50 dark:bg-sidebar">
            <div>
              <div>{{ r.reason }}</div>
              <div class="text-xs text-gray-500">{{ fmtDate(r.processed_at) }}</div>
            </div>
            <div class="text-brand-secondary font-medium">-{{ fmt(r.amount) }}</div>
          </div>
        </section>

        <!-- Status actions -->
        <section v-if="nextStatuses.length > 0" class="border-t border-gray-100 dark:border-sidebar pt-4 space-y-3">
          <h4 class="font-heading font-bold">{{ t('admin.orders.detail.changeStatus') }}</h4>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="s in nextStatuses"
              :key="s"
              type="button"
              class="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar"
              :disabled="updating"
              @click="chooseStatus(s)"
            >
              {{ t(`admin.orders.status.${s}`) }}
            </button>
          </div>
        </section>

        <section class="border-t border-gray-100 dark:border-sidebar pt-4 flex flex-wrap gap-2">
          <button
            v-if="canDownloadInvoice"
            type="button"
            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-medium hover:bg-brand-primary/20 disabled:opacity-60"
            :disabled="invoiceLoading"
            @click="downloadInvoice"
          >
            <UIcon name="i-lucide-file-down" class="w-4 h-4" />
            {{ invoiceLoading ? t('common.loading') : t('admin.orders.detail.downloadInvoice') }}
          </button>
          <button
            v-if="detail.label_pdf_path"
            type="button"
            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-medium hover:bg-brand-primary/20 disabled:opacity-60"
            :disabled="labelLoading"
            @click="openLabel"
          >
            <UIcon name="i-lucide-printer" class="w-4 h-4" />
            {{ labelLoading ? t('common.loading') : t('admin.orders.detail.openLabel') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-primary/10 text-brand-primary text-xs font-medium hover:bg-brand-primary/20 disabled:opacity-60"
            :disabled="purchaseOrderLoading"
            @click="downloadPurchaseOrder"
          >
            <UIcon name="i-lucide-clipboard-list" class="w-4 h-4" />
            {{ purchaseOrderLoading ? t('common.loading') : t('admin.orders.detail.purchaseOrder') }}
          </button>
          <p v-if="invoiceError" class="basis-full text-xs text-brand-secondary">{{ invoiceError }}</p>
          <p v-if="labelError" class="basis-full text-xs text-brand-secondary">{{ labelError }}</p>
          <p v-if="purchaseOrderError" class="basis-full text-xs text-brand-secondary">{{ purchaseOrderError }}</p>
        </section>
      </div>
    </aside>

    <AdminConfirmDialog
      :model-value="!!confirmStatus"
      :title="t('admin.orders.status.confirmTitle')"
      :message="confirmStatus && detail
        ? t('admin.orders.status.confirmMessage', {
            n: detail.order_number,
            s: t(`admin.orders.status.${confirmStatus}`),
          })
        : ''"
      :confirm-label="t('admin.orders.status.confirmCta')"
      :busy="updating"
      :danger="false"
      @update:model-value="(v) => { if (!v) confirmStatus = null }"
      @confirm="applyStatus"
    />
  </div>
</template>
