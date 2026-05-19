<script setup lang="ts">
import { primaryImagePath, type Product } from '~/stores/products'
import { computeUnitPricing } from '~/composables/usePricingPreview'

interface Props {
  product: Product
}
const props = defineProps<Props>()

const { t } = useI18n()
const client = useSupabaseClient()

const imageUrl = computed(() => {
  const path = primaryImagePath(props.product)
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
})

const pricing = computed(() =>
  computeUnitPricing({
    buying_price: Number(props.product.buying_price),
    selling_price: Number(props.product.selling_price),
    discount_percent: Number(props.product.discount_percent ?? 0),
    discount_source: props.product.discount_source ?? null,
  }),
)

const totalStock = computed(() =>
  (props.product.variants ?? []).reduce((s, v) => s + v.stock, 0),
)
const isBackorder = computed(() => !!props.product.available_from)
const isSoldOut = computed(() => totalStock.value <= 0 && !isBackorder.value)

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}
</script>

<template>
  <NuxtLink
    :to="`/product/${product.id}`"
    class="product-card group block bg-white dark:bg-sidebar-surface rounded-card overflow-hidden shadow-card-sm hover:shadow-card-md transition-all hover:-translate-y-1"
  >
    <div class="relative aspect-square bg-gray-100 dark:bg-sidebar overflow-hidden">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
        :alt="product.name.fr"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <UIcon name="i-lucide-image" class="w-10 h-10 text-gray-300" />
      </div>

      <span
        v-if="product.discount_percent > 0"
        class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-brand-secondary text-white text-xs font-bold"
      >
        -{{ product.discount_percent }}%
      </span>
      <span
        v-if="isSoldOut"
        class="absolute inset-0 bg-black/50 text-white flex items-center justify-center font-heading font-bold text-lg"
      >
        {{ t('storefront.soldOut') }}
      </span>
      <span
        v-else-if="isBackorder && totalStock <= 0"
        class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-brand-gold text-white text-xs font-bold"
      >
        {{ t('storefront.backorder') }}
      </span>
    </div>

    <div class="p-4">
      <h3 class="font-heading font-bold truncate">
        {{ product.name.fr }}
      </h3>
      <p class="text-xs text-gray-500 truncate">{{ product.reference }}</p>

      <div class="mt-2 flex items-baseline gap-2">
        <span class="font-heading text-lg font-bold">{{ fmt(pricing.unit_price_paid) }}</span>
        <span
          v-if="product.discount_percent > 0"
          class="text-xs text-gray-400 line-through"
        >
          {{ fmt(Number(product.selling_price)) }}
        </span>
      </div>
    </div>
  </NuxtLink>
</template>
