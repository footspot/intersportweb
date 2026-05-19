<script setup lang="ts">
interface Shop {
  id: string
  name: string
  address: string
  postal_code: string
  city: string
}

interface Props {
  modelValue: string | null
}
defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string | null): void }>()

const { t } = useI18n()
const client = useSupabaseClient()
const shops = ref<Shop[]>([])
const loading = ref(true)

onMounted(async () => {
  const { data } = await client
    .from('intersport_shops')
    .select('id, name, address, postal_code, city')
    .eq('is_active', true)
    .order('sort_order')
  shops.value = (data ?? []) as Shop[]
  loading.value = false
})
</script>

<template>
  <div>
    <label class="block">
      <span class="text-sm font-medium">{{ t('checkout.delivery.chooseShop') }}</span>
      <select
        :value="modelValue ?? ''"
        :disabled="loading"
        required
        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value || null)"
      >
        <option value="" disabled>—</option>
        <option v-for="s in shops" :key="s.id" :value="s.id">
          {{ s.name }} — {{ s.address }}, {{ s.postal_code }} {{ s.city }}
        </option>
      </select>
    </label>
  </div>
</template>
