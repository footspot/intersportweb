<script setup lang="ts">
// * Address-only form. Identity fields (full_name, email, phone) live on the
// * customer-info step and are merged into the final `shipping_address` JSONB
// * by the parent at submit time — never collected here.
export interface ShippingAddress {
  full_name: string
  email: string
  phone: string
  line1: string
  line2: string
  postal_code: string
  city: string
  country: string
}

interface Props {
  modelValue: ShippingAddress
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', v: ShippingAddress): void }>()

const { t } = useI18n()

function set<K extends keyof ShippingAddress>(key: K, value: ShippingAddress[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
    <label class="block md:col-span-2">
      <span class="text-sm font-medium">{{ t('checkout.line1') }}</span>
      <input
        :value="modelValue.line1"
        type="text"
        required
        autocomplete="address-line1"
        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @input="set('line1', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="block md:col-span-2">
      <span class="text-sm font-medium">{{ t('checkout.line2') }}</span>
      <input
        :value="modelValue.line2"
        type="text"
        autocomplete="address-line2"
        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @input="set('line2', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="block">
      <span class="text-sm font-medium">{{ t('checkout.postalCode') }}</span>
      <input
        :value="modelValue.postal_code"
        type="text"
        required
        autocomplete="postal-code"
        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @input="set('postal_code', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="block">
      <span class="text-sm font-medium">{{ t('checkout.city') }}</span>
      <input
        :value="modelValue.city"
        type="text"
        required
        autocomplete="address-level2"
        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @input="set('city', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="block md:col-span-2">
      <span class="text-sm font-medium">{{ t('checkout.country') }}</span>
      <input
        :value="modelValue.country"
        type="text"
        required
        autocomplete="country-name"
        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @input="set('country', ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
</template>
