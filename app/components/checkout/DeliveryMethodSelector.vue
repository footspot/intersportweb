<script setup lang="ts">
export type DeliveryMethod = 'colissimo' | 'club_pickup' | 'shop_pickup'

interface Props {
  modelValue: DeliveryMethod | null
  available: DeliveryMethod[]
}
defineProps<Props>()
defineEmits<{ (e: 'update:modelValue', v: DeliveryMethod): void }>()

const { t } = useI18n()

const OPTIONS: Record<DeliveryMethod, { label: string; hint: string; icon: string }> = {
  colissimo:   { label: 'checkout.delivery.colissimo',   hint: 'checkout.delivery.colissimoHint',   icon: 'i-lucide-truck' },
  club_pickup: { label: 'checkout.delivery.clubPickup',  hint: 'checkout.delivery.clubPickupHint',  icon: 'i-lucide-building' },
  shop_pickup: { label: 'checkout.delivery.shopPickup',  hint: 'checkout.delivery.shopPickupHint',  icon: 'i-lucide-store' },
}
</script>

<template>
  <div v-if="available.length === 0" class="text-sm text-brand-secondary">
    {{ t('checkout.delivery.allDisabled') }}
  </div>
  <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-2">
    <button
      v-for="opt in available"
      :key="opt"
      type="button"
      class="px-4 py-3 rounded-lg border text-sm text-left transition-colors"
      :class="modelValue === opt
        ? 'border-brand-primary bg-brand-primary/5'
        : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
      @click="$emit('update:modelValue', opt)"
    >
      <div class="flex items-center gap-2">
        <UIcon :name="OPTIONS[opt].icon" class="w-4 h-4 text-brand-primary" />
        <span class="font-semibold">{{ t(OPTIONS[opt].label) }}</span>
      </div>
      <div class="text-xs text-gray-500 mt-1">{{ t(OPTIONS[opt].hint) }}</div>
    </button>
  </div>
</template>
