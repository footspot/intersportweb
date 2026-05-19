<script setup lang="ts">
import { useCartStore } from '~/stores/cart'

interface Props {
  showShipping?: boolean
  shipping?: number
  promoDiscount?: number
  promoCode?: string | null
}
const props = withDefaults(defineProps<Props>(), {
  showShipping: false,
  shipping: 0,
  promoDiscount: 0,
  promoCode: null,
})

const { t } = useI18n()
const cart = useCartStore()

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

const total = computed(() => {
  const t = cart.subtotal + (props.showShipping ? props.shipping : 0) - props.promoDiscount
  return Math.max(0, t)
})
</script>

<template>
  <div class="space-y-1 text-sm">
    <div class="flex justify-between">
      <span class="text-gray-500">{{ t('cart.subtotal') }}</span>
      <span>{{ fmt(cart.subtotal) }}</span>
    </div>
    <div v-if="showShipping" class="flex justify-between">
      <span class="text-gray-500">{{ t('cart.shipping') }}</span>
      <span>{{ fmt(shipping) }}</span>
    </div>
    <div v-if="promoDiscount > 0" class="flex justify-between text-brand-green">
      <span>{{ t('cart.promoApplied', { code: promoCode ?? '' }) }}</span>
      <span>-{{ fmt(promoDiscount) }}</span>
    </div>
    <div class="flex justify-between font-heading text-lg font-bold pt-1">
      <span>{{ t('cart.total') }}</span>
      <span>{{ fmt(total) }}</span>
    </div>
  </div>
</template>
