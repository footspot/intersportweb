<script setup lang="ts">
export interface GuestIdentity {
  first_name: string
  last_name: string
  email: string
  phone: string
}

interface Props { modelValue: GuestIdentity }
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', v: GuestIdentity): void }>()

const { t } = useI18n()

function set<K extends keyof GuestIdentity>(key: K, value: GuestIdentity[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-xs text-gray-500">{{ t('checkout.guestNotice') }}</p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <label class="block">
        <span class="text-sm font-medium">{{ t('checkout.guestFirstName') }}</span>
        <input
          :value="modelValue.first_name"
          type="text"
          required
          autocomplete="given-name"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          @input="set('first_name', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('checkout.guestLastName') }}</span>
        <input
          :value="modelValue.last_name"
          type="text"
          required
          autocomplete="family-name"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          @input="set('last_name', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <label class="block md:col-span-2">
        <span class="text-sm font-medium">{{ t('checkout.email') }}</span>
        <input
          :value="modelValue.email"
          type="email"
          required
          autocomplete="email"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          @input="set('email', ($event.target as HTMLInputElement).value)"
        />
        <span class="text-[11px] text-gray-500">{{ t('checkout.guestEmailHelp') }}</span>
      </label>

      <label class="block md:col-span-2">
        <span class="text-sm font-medium">{{ t('checkout.phone') }}</span>
        <input
          :value="modelValue.phone"
          type="tel"
          required
          autocomplete="tel"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          @input="set('phone', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
  </div>
</template>
