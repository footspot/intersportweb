<script setup lang="ts">
// * Colissimo tracking modal — input + optional "mark as shipped" shortcut.
import type { Order } from '~/stores/orders'
import { useOrdersStore } from '~/stores/orders'

interface Props {
  modelValue: boolean
  order: Order | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const orders = useOrdersStore()

const tracking = ref('')
const markShipped = ref(false)
const saving = ref(false)
const errorMsg = ref<string | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    tracking.value = props.order?.shipping_tracking ?? ''
    markShipped.value = props.order?.status === 'paid'
    errorMsg.value = null
  },
  { immediate: true },
)

const trackingUrl = computed(() => {
  const code = tracking.value.trim()
  if (!code) return ''
  return `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(code)}`
})

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function save() {
  if (!props.order) return
  errorMsg.value = null
  saving.value = true
  try {
    await orders.setTracking(props.order.id, tracking.value.trim() || null, markShipped.value)
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.errors.generic')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-md bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
      <h3 class="font-heading text-lg font-bold">
        {{ t('admin.orders.tracking.title', { n: order?.order_number ?? '' }) }}
      </h3>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.orders.tracking.code') }}</span>
        <input
          v-model="tracking"
          type="text"
          maxlength="13"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none font-mono"
          placeholder="AB123456789FR"
        />
        <a
          v-if="trackingUrl"
          :href="trackingUrl"
          target="_blank"
          class="text-xs text-brand-primary hover:underline mt-1 inline-flex items-center gap-1"
        >
          <UIcon name="i-lucide-external-link" class="w-3 h-3" />
          {{ t('admin.orders.tracking.open') }}
        </a>
      </label>

      <label class="flex items-center gap-2 text-sm">
        <input v-model="markShipped" type="checkbox" class="w-4 h-4 accent-brand-primary" />
        <span>{{ t('admin.orders.tracking.markShipped') }}</span>
      </label>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
          :disabled="saving"
          @click="close"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
