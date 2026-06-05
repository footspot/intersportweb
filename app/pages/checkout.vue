<script setup lang="ts">
// * /checkout — accordion layout. Three sections stack vertically with one
// * expanded at a time:
// *   1. Adresse   — guest identity (hidden for logged-in customers)
// *   2. Livraison — delivery method + conditional address / shop picker
// *   3. Paiement  — static payment info + the Pay button
// *
// * Submit flow stays the same: validate → cart-validate → create-order →
// * create-form-token → Smartform takes over the page.
import { useCartStore } from '~/stores/cart'
import { invokeEdge } from '~/composables/useEdgeFunction'
import type { ShippingAddress } from '~/components/checkout/ShippingForm.vue'
import type { DeliveryMethod } from '~/components/checkout/DeliveryMethodSelector.vue'
import type { GuestIdentity } from '~/components/checkout/GuestIdentityForm.vue'

definePageMeta({ ssr: false })

const { t } = useI18n()
const cart = useCartStore()
const config = useRuntimeConfig()
const supabase = useSupabaseClient()

const guest = ref<GuestIdentity>({ first_name: '', last_name: '', email: '', phone: '' })

interface AppliedPromo {
  promo_code_id: string
  code: string
  amount: number
  absorbs_by: 'intersport' | 'club'
}
const appliedPromo = ref<AppliedPromo | null>(null)

interface PurchaseApplied { code: string; member_id: string; member_name?: string }
interface PrepaidApplied {
  code: string
  prepaid_code_ref: string
  member_id: string
  member_name?: string
  member_email?: string
  club_id: string
  club_name?: string
  cap_amount_cents: number
}
const purchaseApplied = ref<PurchaseApplied | null>(null)
const prepaidApplied = ref<PrepaidApplied | null>(null)
const prepaidCredit = computed(() => {
  if (!prepaidApplied.value) return 0
  const afterPromo = Math.max(0, cart.subtotal - promoDiscount.value)
  return Math.min(prepaidApplied.value.cap_amount_cents / 100, afterPromo)
})
const promoDiscount = computed(() =>
  appliedPromo.value ? Math.min(appliedPromo.value.amount, cart.subtotal) : 0,
)

const deliveryMethod = ref<DeliveryMethod | null>(null)
const pickupShopId = ref<string | null>(null)
const shipping = ref<ShippingAddress>({
  full_name: '',
  email: '',
  phone: '',
  line1: '',
  line2: '',
  postal_code: '',
  city: '',
  country: 'France',
})

interface ClubFlags {
  delivery_colissimo_enabled: boolean
  delivery_club_pickup_enabled: boolean
  footspot_linked: boolean
  delivery_shop_pickup_enabled: boolean
  club_pickup_delay_days: number | null
  shop_pickup_delay_days: number | null
}
const clubFlags = ref<ClubFlags | null>(null)

watchEffect(async () => {
  const clubId = cart.lines[0]?.club_id
  if (!clubId) {
    clubFlags.value = null
    return
  }
  const { data } = await supabase
    .from('clubs')
    .select('delivery_colissimo_enabled, delivery_club_pickup_enabled, delivery_shop_pickup_enabled, footspot_linked, club_pickup_delay_days, shop_pickup_delay_days')
    .eq('id', clubId)
    .maybeSingle()
  clubFlags.value = data as ClubFlags | null
  if (!deliveryMethod.value && data) {
    if (data.delivery_colissimo_enabled) deliveryMethod.value = 'colissimo'
    else if (data.delivery_club_pickup_enabled) deliveryMethod.value = 'club_pickup'
    else if (data.delivery_shop_pickup_enabled) deliveryMethod.value = 'shop_pickup'
  }
})

const availableDelivery = computed<DeliveryMethod[]>(() => {
  const f = clubFlags.value
  if (!f) return []
  const out: DeliveryMethod[] = []
  if (f.delivery_colissimo_enabled) out.push('colissimo')
  if (f.delivery_club_pickup_enabled) out.push('club_pickup')
  if (f.delivery_shop_pickup_enabled) out.push('shop_pickup')
  return out
})

const SHIPPING_COST = 6.9
const shippingCostNow = computed(() => (deliveryMethod.value === 'colissimo' ? SHIPPING_COST : 0))

const submitting = ref(false)
const errorMsg = ref<string | null>(null)
const validationIssues = ref<any[]>([])

const formToken = ref<string | null>(null)
const pendingOrder = ref<{ id: string; access_token: string; number: string } | null>(null)

// * Multi-open collapsibles. Section ids: 1 = customer info, 2 = delivery,
// * 3 = payment. Opening or closing one panel never touches the others, so
// * the buyer can keep everything visible to double-check before paying.
const openSections = reactive<Record<1 | 2 | 3, boolean>>({
  1: true,
  2: false,
  3: false,
})
function isOpen(id: 1 | 2 | 3) { return openSections[id] }
function toggleSection(id: 1 | 2 | 3) { openSections[id] = !openSections[id] }
function openOnly(id: 1 | 2 | 3) { openSections[id] = true }

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}
function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}
function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return (crypto as any).randomUUID()
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  a[6] = (a[6] & 0x0f) | 0x40
  a[8] = (a[8] & 0x3f) | 0x80
  const h = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function addressOk(): boolean {
  return !!(
    guest.value.first_name &&
    guest.value.last_name &&
    isValidEmail(guest.value.email) &&
    guest.value.phone?.trim()
  )
}
function deliveryOk(): boolean {
  if (!deliveryMethod.value) return false
  if (deliveryMethod.value === 'colissimo') {
    const a = shipping.value
    return !!(a.line1 && a.postal_code && a.city && a.country)
  }
  if (deliveryMethod.value === 'shop_pickup') return !!pickupShopId.value
  return true
}

function validate(): string | null {
  if (cart.isEmpty) return t('checkout.errors.cartEmpty')
  if (!addressOk()) {
    if (!guest.value.email) return t('checkout.errors.guestIdentity')
    if (!isValidEmail(guest.value.email)) return t('checkout.errors.guestEmailInvalid')
    if (!guest.value.phone?.trim()) return t('checkout.errors.phoneRequired')
    return t('checkout.errors.guestIdentity')
  }
  if (!deliveryOk()) {
    if (!deliveryMethod.value) return t('checkout.errors.deliveryRequired')
    if (deliveryMethod.value === 'shop_pickup') return t('checkout.errors.shopRequired')
    return t('checkout.errors.addressIncomplete')
  }
  return null
}

const idempotencyKey = useState<string>('checkout-idempotency-key', () => uuid())

async function onSubmit() {
  errorMsg.value = null
  validationIssues.value = []
  const v = validate()
  if (v) {
    errorMsg.value = v
    // * Auto-expand the offending section.
    if (!addressOk()) openOnly(1)
    else if (!deliveryOk()) openOnly(2)
    return
  }
  submitting.value = true
  try {
    const { data: vRes, error: vErr } = await invokeEdge<any>('cart-validate', {
      method: 'POST',
      body: {
        lines: cart.lines.map((l) => ({
          line_id: l.line_id,
          product_id: l.product_id,
          variant_id: l.variant_id,
          size: l.size,
          secondary_size: l.secondary_size,
          quantity: l.quantity,
          unit_price_paid: l.unit_price_paid,
        })),
      },
    })
    if (vErr) throw new Error(vErr.message)
    if (!vRes?.all_ok) {
      validationIssues.value = (vRes?.lines ?? []).filter((l: any) => !l.ok)
      errorMsg.value = t('checkout.errors.validation')
      return
    }

    // * Build shipping_address JSONB by merging step-1 identity into the
    // * step-2 address fields. Pickup methods skip the address payload.
    const mergedShipping =
      deliveryMethod.value === 'colissimo'
        ? {
            ...shipping.value,
            full_name: `${guest.value.first_name} ${guest.value.last_name}`.trim(),
            email: guest.value.email,
            phone: guest.value.phone,
          }
        : undefined

    const { data: order, error: oErr } = await invokeEdge<any>('create-order', {
      method: 'POST',
      body: {
        idempotency_key: idempotencyKey.value,
        lines: cart.lines.map((l) => ({
          product_id: l.product_id,
          variant_id: l.variant_id,
          size: l.size,
          secondary_size: l.secondary_size,
          quantity: l.quantity,
          flocking: l.flocking,
        })),
        delivery_method: deliveryMethod.value,
        shipping_address: mergedShipping,
        pickup_shop_id: deliveryMethod.value === 'shop_pickup' ? pickupShopId.value : undefined,
        promo_code_id: appliedPromo.value?.promo_code_id,
        prepaid_code: prepaidApplied.value?.code,
        footspot_member_id: prepaidApplied.value?.member_id ?? purchaseApplied.value?.member_id,
        guest: {
          email: guest.value.email,
          first_name: guest.value.first_name,
          last_name: guest.value.last_name,
          phone: guest.value.phone,
        },
      },
    })
    if (oErr || !order?.order) throw new Error(oErr?.message ?? 'create_order_failed')
    pendingOrder.value = order.order

    const { data: tokenRes, error: tErr } = await invokeEdge<any>('create-form-token', {
      method: 'POST',
      body: { order_id: order.order.id, access_token: order.order.access_token },
    })
    if (tErr || !tokenRes?.form_token) throw new Error(tErr?.message ?? 'form_token_failed')
    formToken.value = tokenRes.form_token
    cart.clear()
    idempotencyKey.value = uuid()
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('checkout.errors.generic')
  } finally {
    submitting.value = false
  }
}

const successUrl = computed(() => {
  if (!pendingOrder.value) return '/'
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : (config.public.siteUrl as string) || ''
  return `${origin}/order/${pendingOrder.value.access_token}`
})

// * Section numbers used in the accordion headers.
const sectionNum = { address: 1, delivery: 2, payment: 3 } as const
</script>

<template>
  <section class="max-w-5xl mx-auto px-4 py-10">
    <h1 class="font-heading text-2xl font-bold mb-6">{{ t('checkout.title') }}</h1>

    <ClientOnly>
      <template #fallback>
        <div class="p-10 text-center text-gray-400">
          <UIcon name="i-lucide-loader-2" class="w-6 h-6 mx-auto animate-spin opacity-60" />
        </div>
      </template>

    <div v-if="cart.isEmpty && !formToken" class="p-10 text-center text-gray-500 bg-gray-50 dark:bg-sidebar-surface rounded-card">
      <UIcon name="i-lucide-shopping-bag" class="w-12 h-12 mx-auto mb-2 opacity-40" />
      <p>{{ t('cart.empty') }}</p>
      <NuxtLink to="/" class="inline-block mt-3 text-brand-primary hover:underline">{{ t('orders.goShopping') }}</NuxtLink>
    </div>

    <div v-else-if="formToken" class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5 max-w-xl mx-auto">
      <h2 class="font-heading font-bold mb-4">{{ t('checkout.payment.title') }}</h2>
      <CheckoutSystempaySmartform
        :form-token="formToken"
        :success-url="successUrl"
        @error="(m) => (errorMsg = m)"
      />
      <p v-if="errorMsg" class="text-sm text-brand-secondary mt-3">{{ errorMsg }}</p>
    </div>

    <form v-else class="grid grid-cols-1 lg:grid-cols-3 gap-6" @submit.prevent="onSubmit">
      <div class="lg:col-span-2 space-y-3">
        <!-- 1. Adresse — only for guest checkouts -->
        <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
          <button
            type="button"
            class="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50/60 dark:hover:bg-sidebar/30"
            @click="toggleSection(1)"
          >
            <span class="flex items-center gap-3">
              <span
                :class="addressOk() ? 'bg-brand-primary text-white' : 'bg-gray-200 dark:bg-sidebar text-gray-500'"
                class="w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-semibold"
              >
                <UIcon v-if="addressOk()" name="i-lucide-check" class="w-4 h-4" />
                <span v-else>{{ sectionNum.address }}</span>
              </span>
              <span class="font-heading font-bold">{{ t('checkout.customerInfo') }}</span>
            </span>
            <UIcon
              :name="isOpen(1) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="w-4 h-4 text-gray-400"
            />
          </button>
          <div v-show="isOpen(1)" class="px-5 pb-5">
            <CheckoutGuestIdentityForm v-model="guest" />
            <div class="flex justify-end mt-4">
              <button
                type="button"
                class="px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
                :disabled="!addressOk()"
                @click="openOnly(2)"
              >
                {{ t('common.next') }}
              </button>
            </div>
          </div>
        </section>

        <!-- 2. Livraison -->
        <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
          <button
            type="button"
            class="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50/60 dark:hover:bg-sidebar/30"
            @click="toggleSection(2)"
          >
            <span class="flex items-center gap-3">
              <span
                :class="deliveryOk() ? 'bg-brand-primary text-white' : 'bg-gray-200 dark:bg-sidebar text-gray-500'"
                class="w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-semibold"
              >
                <UIcon v-if="deliveryOk()" name="i-lucide-check" class="w-4 h-4" />
                <span v-else>{{ sectionNum.delivery }}</span>
              </span>
              <span class="font-heading font-bold">{{ t('checkout.delivery.title') }}</span>
            </span>
            <UIcon
              :name="isOpen(2) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="w-4 h-4 text-gray-400"
            />
          </button>
          <div v-show="isOpen(2)" class="px-5 pb-5 space-y-4">
            <CheckoutDeliveryMethodSelector v-model="deliveryMethod" :available="availableDelivery" />
            <div v-if="deliveryMethod === 'colissimo'">
              <CheckoutShippingForm v-model="shipping" />
            </div>
            <div v-else-if="deliveryMethod === 'shop_pickup'" class="space-y-2">
              <CheckoutPickupShopPicker v-model="pickupShopId" />
              <p class="flex items-center gap-1.5 text-xs text-gray-500">
                <UIcon name="i-lucide-clock" class="w-3.5 h-3.5 text-brand-primary" />
                <span v-if="clubFlags?.shop_pickup_delay_days != null">{{ t('checkout.delivery.pickupDelay', { n: clubFlags.shop_pickup_delay_days }) }}</span>
                <span v-else>{{ t('checkout.delivery.pickupDelayGeneric') }}</span>
              </p>
            </div>
            <div v-else-if="deliveryMethod === 'club_pickup'" class="flex items-center gap-1.5 text-xs text-gray-500">
              <UIcon name="i-lucide-clock" class="w-3.5 h-3.5 text-brand-primary" />
              <span v-if="clubFlags?.club_pickup_delay_days != null">{{ t('checkout.delivery.pickupDelay', { n: clubFlags.club_pickup_delay_days }) }}</span>
              <span v-else>{{ t('checkout.delivery.pickupDelayGeneric') }}</span>
            </div>
            <div class="flex justify-end">
              <button
                type="button"
                class="px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
                :disabled="!deliveryOk()"
                @click="openOnly(3)"
              >
                {{ t('common.next') }}
              </button>
            </div>
          </div>
        </section>

        <!-- 3. Paiement -->
        <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
          <button
            type="button"
            class="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50/60 dark:hover:bg-sidebar/30"
            @click="toggleSection(3)"
          >
            <span class="flex items-center gap-3">
              <span
                :class="addressOk() && deliveryOk() ? 'bg-brand-primary text-white' : 'bg-gray-200 dark:bg-sidebar text-gray-500'"
                class="w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-semibold"
              >
                <span>{{ sectionNum.payment }}</span>
              </span>
              <span class="font-heading font-bold">{{ t('checkout.payment.title') }}</span>
            </span>
            <UIcon
              :name="isOpen(3) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
              class="w-4 h-4 text-gray-400"
            />
          </button>
          <div v-show="isOpen(3)" class="px-5 pb-5 space-y-4">
            <div class="flex items-center gap-2 text-sm">
              <UIcon name="i-lucide-credit-card" class="w-4 h-4 text-brand-primary" />
              <span class="font-semibold">{{ t('checkout.payment.card') }}</span>
            </div>
            <p class="text-xs text-gray-500">{{ t('checkout.payment.cardHint') }}</p>

            <button
              type="submit"
              :disabled="submitting"
              class="w-full py-3 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <UIcon v-if="!submitting" name="i-lucide-lock" class="w-4 h-4" />
              {{ submitting ? t('common.loading') : t('checkout.placeOrder') }}
            </button>
            <p class="text-xs text-gray-500 text-center">{{ t('checkout.securityHint') }}</p>
          </div>
        </section>

        <div v-if="validationIssues.length > 0" class="bg-brand-secondary/10 border border-brand-secondary/30 rounded-card p-4 text-sm space-y-1">
          <p class="font-medium text-brand-secondary">{{ t('checkout.errors.validation') }}</p>
          <ul class="list-disc pl-5 text-xs text-gray-600 dark:text-gray-300">
            <li v-for="l in validationIssues" :key="l.line_id">
              <template v-if="l.reason === 'out_of_stock'">
                {{ t('checkout.issues.outOfStock', { n: l.available_stock ?? 0 }) }}
              </template>
              <template v-else-if="l.reason === 'price_changed'">
                {{ t('checkout.issues.priceChanged', { p: fmt(l.current_price ?? 0) }) }}
              </template>
              <template v-else-if="l.reason === 'bundle_unavailable' || l.reason === 'bundle_component_missing'">
                {{ t('checkout.issues.bundleUnavailable') }}
              </template>
              <template v-else>{{ l.reason }}</template>
            </li>
          </ul>
        </div>

        <p v-if="errorMsg && validationIssues.length === 0" class="text-sm text-brand-secondary">{{ errorMsg }}</p>
      </div>

      <aside class="space-y-4">
        <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5 space-y-3">
          <h2 class="font-heading font-bold">{{ t('checkout.summary') }}</h2>
          <ul class="space-y-2 text-sm">
            <li v-for="l in cart.lines" :key="l.line_id" class="flex justify-between gap-3">
              <span class="flex-1 min-w-0 truncate">{{ l.name.fr }} · {{ l.size }}<template v-if="l.secondary_size"> / {{ l.secondary_size }}</template> × {{ l.quantity }}</span>
              <span class="shrink-0 font-medium">{{ fmt(l.unit_price_paid * l.quantity) }}</span>
            </li>
          </ul>
          <CheckoutPromoCodeInput
            :subtotal="cart.subtotal"
            :applied="appliedPromo"
            @update:applied="(v) => (appliedPromo = v)"
          />
          <CheckoutFootspotStep
            v-if="cart.lines[0]"
            :club-id="cart.lines[0].club_id"
            :subtotal-after-promo="cart.subtotal - promoDiscount"
            :enabled="!!clubFlags?.footspot_linked"
            :purchase-applied="purchaseApplied"
            :prepaid-applied="prepaidApplied"
            @update:purchase-applied="(v) => (purchaseApplied = v)"
            @update:prepaid-applied="(v) => (prepaidApplied = v)"
            @identity-locked="(v) => {
              if (v) {
                guest = { ...guest, first_name: v.first_name, last_name: v.last_name, email: v.email }
              }
            }"
          />
          <CartSummary
            :show-shipping="true"
            :shipping="shippingCostNow"
            :promo-discount="promoDiscount"
            :promo-code="appliedPromo?.code ?? null"
            :prepaid-credit="prepaidCredit"
            :prepaid-code="prepaidApplied?.code ?? null"
            class="pt-3 border-t border-gray-100 dark:border-sidebar"
          />
        </section>
      </aside>
    </form>
    </ClientOnly>
  </section>
</template>
