<script setup lang="ts">
// * Clearance / déstockage panel — opens from the "Soldes" entry card.
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t, locale } = flow
</script>

<template>
  <Transition name="panel">
    <section v-if="flow.mode.value === 'clearance'" data-home-clearance class="px-6 md:px-10 lg:px-12 pb-16 pt-4 bg-page dark:bg-sidebar-bg">
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-accent text-white flex items-center justify-center">
            <UIcon name="i-lucide-tag" class="w-5 h-5" />
          </div>
          <h2 class="font-heading text-xl md:text-[22px] font-extrabold uppercase tracking-[0.02em] text-ink dark:text-white flex items-center gap-2">
            {{ t('storefront.home.clearance.title') }}
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-accent text-white animate-pulse">
              {{ t('storefront.home.clearance.badge') }}
            </span>
          </h2>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent px-3.5 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition"
          @click="flow.goHome({ scroll: true })"
        >
          ← {{ t('storefront.home.backToHomeCatalog') }}
        </button>
      </div>

      <div v-if="!flow.clearanceProducts.value.length" class="py-16 text-center text-gray-500">
        <UIcon name="i-lucide-package" class="w-12 h-12 mx-auto mb-4 opacity-40" />
        <p class="text-sm">{{ t('storefront.home.clearance.empty') }}</p>
      </div>

      <div v-else class="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-7 gap-3">
        <NuxtLink
          v-for="(p, i) in flow.clearanceProducts.value"
          :key="p.id"
          :to="`/product/${p.id}`"
          class="home-product-card group bg-white dark:bg-sidebar-surface rounded-2xl overflow-hidden border border-accent/30 transition-all hover:-translate-y-1.5 hover:shadow-card-lg hover:border-accent cursor-pointer relative no-underline text-inherit"
          :style="{ animationDelay: `${i * 0.05}s` }"
        >
          <div class="aspect-square relative overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface flex items-center justify-center p-2">
            <img
              v-if="flow.productImageUrl(p.images[0]?.image_path ?? null)"
              :src="flow.productImageUrl(p.images[0]?.image_path ?? null)!"
              class="w-full h-full object-contain"
              :alt="p.name.fr"
            >
            <UIcon v-else name="i-lucide-image" class="w-12 h-12 text-gray-300 opacity-40" />
            <span
              v-if="flow.displayDiscount(p) > 0"
              class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-accent text-white"
            >
              -{{ flow.displayDiscount(p) }}%
            </span>
          </div>
          <div class="p-2.5">
            <div class="text-[9px] text-gray-400 tracking-[0.5px] uppercase mb-0.5">REF: {{ p.reference }}</div>
            <div class="font-semibold text-[12px] leading-[1.3] mb-1 line-clamp-2">
              {{ p.name[locale as 'fr' | 'en'] ?? p.name.fr }}
            </div>
            <div class="font-heading font-extrabold text-sm text-accent">
              {{ flow.fmt(flow.finalPrice(p)) }}
              <span v-if="flow.displayDiscount(p) > 0" class="line-through text-[10px] text-gray-400 font-normal ml-1">
                {{ flow.fmt(Number(p.selling_price)) }}
              </span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>
  </Transition>
</template>
