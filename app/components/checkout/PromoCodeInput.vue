<script setup lang="ts">
// * Promo code input. Calls validate-promo-code on submit; parent receives
// *   the validated promo via v-model:applied (or null when cleared).
// *   Cart lines are sent so the server can compute the ELIGIBLE discount for
// *   club / product-pack scoped codes (only the matching lines count).
import { invokeEdge } from '~/composables/useEdgeFunction'
import { useCartStore } from '~/stores/cart'

interface ValidPromo {
  promo_code_id: string
  code: string
  amount: number // * the eligible discount actually applied (already capped)
  full_amount: number // * the code's face value
  absorbs_by: 'intersport' | 'club'
  scope: 'global' | 'club' | 'products'
}

interface Props {
  subtotal: number
  applied: ValidPromo | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:applied', v: ValidPromo | null): void
}>()

const { t } = useI18n()
const cart = useCartStore()
const codeInput = ref('')
const checking = ref(false)
const errorMsg = ref<string | null>(null)

function eur(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

async function apply() {
  errorMsg.value = null
  const code = codeInput.value.trim().toUpperCase()
  if (!code) {
    errorMsg.value = t('cart.promo.errors.empty')
    return
  }
  checking.value = true
  try {
    const lines = cart.lines.map((l) => ({
      product_id: l.product_id,
      club_id: l.club_id,
      line_total: l.unit_price_paid * l.quantity,
    }))
    const { data, error } = await invokeEdge<{
      valid: boolean
      reason?: string
      min_subtotal?: number
      promo_code_id?: string
      code?: string
      amount?: number
      full_amount?: number
      absorbs_by?: 'intersport' | 'club'
      scope?: 'global' | 'club' | 'products'
    }>('validate-promo-code', {
      method: 'POST',
      body: { code, subtotal: props.subtotal, lines },
    })
    if (error) throw new Error(error.message)
    if (!data?.valid) {
      const reason = data?.reason ?? 'unknown'
      const msgKey = `cart.promo.errors.${reason}`
      errorMsg.value = data?.min_subtotal
        ? t('cart.promo.errors.below_min_subtotal_v', {
            min: eur(data.min_subtotal),
          })
        : t(msgKey)
      emit('update:applied', null)
      return
    }
    emit('update:applied', {
      promo_code_id: data.promo_code_id!,
      code: data.code!,
      amount: data.amount!,
      full_amount: data.full_amount ?? data.amount!,
      absorbs_by: data.absorbs_by!,
      scope: data.scope ?? 'global',
    })
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : t('auth.errors.generic')
    emit('update:applied', null)
  } finally {
    checking.value = false
  }
}

function clear() {
  codeInput.value = ''
  errorMsg.value = null
  emit('update:applied', null)
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="applied" class="p-3 rounded-lg bg-brand-green/10 border border-brand-green/30 text-sm">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-ticket-check" class="w-4 h-4 text-brand-green" />
          <span class="font-mono font-medium">{{ applied.code }}</span>
          <span class="text-brand-green">
            {{ t('cart.promo.applied', { amount: eur(applied.amount) }) }}
          </span>
        </div>
        <button
          type="button"
          class="text-xs text-brand-secondary hover:underline"
          @click="clear"
        >
          {{ t('cart.promo.remove') }}
        </button>
      </div>
      <!-- * Scoped code whose face value exceeds the eligible portion of the cart. -->
      <p v-if="applied.scope !== 'global' && applied.amount < applied.full_amount" class="text-xs text-gray-500 mt-1">
        {{ t('cart.promo.partial', { full: eur(applied.full_amount), applied: eur(applied.amount) }) }}
      </p>
    </div>
    <div v-else class="flex items-stretch gap-2">
      <input
        v-model="codeInput"
        type="text"
        :placeholder="t('cart.promo.placeholder')"
        class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm font-mono uppercase focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @keyup.enter="apply"
      />
      <button
        type="button"
        :disabled="checking || !codeInput.trim()"
        class="shrink-0 whitespace-nowrap px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-60"
        @click="apply"
      >
        {{ checking ? t('common.loading') : t('cart.promo.apply') }}
      </button>
    </div>
    <p v-if="errorMsg" class="text-xs text-brand-secondary">{{ errorMsg }}</p>
  </div>
</template>
