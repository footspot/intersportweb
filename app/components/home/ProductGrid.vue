<script setup lang="ts">
// * Product grid with "curtain drop" entry animation — full grid slides in
// * from -100% to 0 on a cubic-bezier(.22,1,.36,1) / 0.6s curve.
import type { Product } from '~/stores/products'

interface Props {
  products: Product[]
  // * If true, animate the grid drop on mount. False when just filtering.
  animate?: boolean
}
const props = withDefaults(defineProps<Props>(), { animate: true })

const { t } = useI18n()
const mounted = ref(false)
onMounted(() => {
  requestAnimationFrame(() => (mounted.value = true))
})
</script>

<template>
  <!-- * py-4/-my-4 extends the overflow-hidden clip area so box-shadows and
       * the card hover lift (-translate-y-1) are not clipped by the boundary. -->
  <div class="overflow-hidden py-4 -my-4 px-2 -mx-2">
    <div
      class="transition-transform duration-[600ms] ease-[cubic-bezier(.22,1,.36,1)]"
      :class="!props.animate || mounted ? 'translate-y-0' : '-translate-y-full'"
    >
      <div v-if="products.length === 0" class="p-10 text-center text-gray-500">
        <UIcon name="i-lucide-package-open" class="w-10 h-10 mx-auto mb-2 opacity-40" />
        {{ t('storefront.noProducts') }}
      </div>
      <div
        v-else
        class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
      >
        <HomeProductCard v-for="p in products" :key="p.id" :product="p" />
      </div>
    </div>
  </div>
</template>
