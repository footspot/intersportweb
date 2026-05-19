<script setup lang="ts">
// * Promo code input. Calls validate-promo-code on submit; parent receives
// *   the validated promo via v-model:applied (or null when cleared).
import { invokeEdge } from '~/composables/useEdgeFunction'

interface ValidPromo {
  promo_code_id: string
  code: string
  amount: number
  absorbs_by: 'intersport' | 'club'
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
const codeInput = ref('')
const checking = ref(false)
const errorMsg = ref<string | null>(null)

async function apply() {
  errorMsg.value = null
  const code = codeInput.value.trim().toUpperCase()
  if (!code) {
    errorMsg.value = t('cart.promo.errors.empty')
    return
  }
  checking.value = true
  try {
    const { data, error } = await invokeEdge<{
      valid: boolean
      reason?: string
      min_subtotal?: number
      promo_code_id?: string
      code?: string
      amount?: number
      absorbs_by?: 'intersport' | 'club'
    }>('validate-promo-code', {
      method: 'POST',
      body: { code, subtotal: props.subtotal },
    })
    if (error) throw new Error(error.message)
    if (!data?.valid) {
      const reason = data?.reason ?? 'unknown'
      const msgKey = `cart.promo.errors.${reason}`
      errorMsg.value = data?.min_subtotal
        ? t('cart.promo.errors.below_min_subtotal_v', {
            min: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(data.min_subtotal),
          })
        : t(msgKey)
      emit('update:applied', null)
      return
    }
    emit('update:applied', {
      promo_code_id: data.promo_code_id!,
      code: data.code!,
      amount: data.amount!,
      absorbs_by: data.absorbs_by!,
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
    <div v-if="applied" class="flex items-center justify-between p-3 rounded-lg bg-brand-green/10 border border-brand-green/30 text-sm">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-ticket-check" class="w-4 h-4 text-brand-green" />
        <span class="font-mono font-medium">{{ applied.code }}</span>
        <span class="text-brand-green">
          {{ t('cart.promo.applied', { amount: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(applied.amount) }) }}
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
    <div v-else class="flex items-stretch gap-2">
      <input
        v-model="codeInput"
        type="text"
        :placeholder="t('cart.promo.placeholder')"
        class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm font-mono uppercase focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @keyup.enter="apply"
      />
      <button
        type="button"
        :disabled="checking || !codeInput.trim()"
        class="px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-60"
        @click="apply"
      >
        {{ checking ? t('common.loading') : t('cart.promo.apply') }}
      </button>
    </div>
    <p v-if="errorMsg" class="text-xs text-brand-secondary">{{ errorMsg }}</p>
  </div>
</template>
