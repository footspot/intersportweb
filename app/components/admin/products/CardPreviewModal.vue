<script setup lang="ts">
// * Read-only preview of how a product is rendered as a card on the shop side.
// * Mounts the same HomeProductCard the storefront uses, wrapped to neutralize
// * the inner NuxtLink so clicks inside the modal don't navigate away.
import type { Product } from '~/stores/products'

interface Props {
  modelValue: boolean
  product: Product | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
}>()

const { t } = useI18n()

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <div
    v-if="modelValue && product"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-md bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-heading text-lg font-bold">{{ t('admin.products.cardPreview.title') }}</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ t('admin.products.cardPreview.subtitle') }}
          </p>
        </div>
        <button
          type="button"
          class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar text-gray-500"
          :aria-label="t('common.close')"
          @click="close"
        >
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>

      <div class="bg-gray-50 dark:bg-sidebar rounded-card p-4">
        <div class="max-w-[260px] mx-auto pointer-events-none">
          <HomeProductCard :product="product" />
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-1">
        <NuxtLink
          :to="`/product/${product.id}`"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
        >
          <UIcon name="i-lucide-external-link" class="w-4 h-4" />
          {{ t('admin.products.cardPreview.openProductPage') }}
        </NuxtLink>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark"
          @click="close"
        >
          {{ t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>
