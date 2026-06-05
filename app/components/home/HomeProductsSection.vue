<script setup lang="ts">
// * Club products grid — opens once a club is selected. Category filters,
// * discount/flocking/pack badges, per-club accent colour.
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t, locale } = flow
// * Local alias so scoped `v-bind()` can reference the accent colour.
const accentCss = flow.accentCss
</script>

<template>
  <Transition name="panel">
    <section
      v-if="flow.mode.value === 'products'"
      data-home-products
      class="px-6 md:px-10 lg:px-12 pb-16 pt-4 bg-page dark:bg-sidebar-bg"
      :style="{ '--accent': accentCss }"
    >
      <div class="mb-6 space-y-1">
        <div
          v-if="flow.selectedClub.value?.accent_color"
          class="h-0.5 rounded-full"
          :style="{ background: `linear-gradient(to right, ${flow.selectedClub.value.accent_color}cc 0%, ${flow.selectedClub.value.accent_color}77 25%, ${flow.selectedClub.value.accent_color}33 50%, ${flow.selectedClub.value.accent_color}77 75%, ${flow.selectedClub.value.accent_color}cc 100%)` }"
        />
        <div class="relative rounded-2xl overflow-hidden px-5 py-4 flex items-start justify-between flex-wrap gap-3">
          <div
            v-if="flow.selectedClub.value?.accent_color"
            class="absolute inset-0 pointer-events-none"
            :style="{ background: `linear-gradient(to right, transparent 0%, ${flow.selectedClub.value.accent_color}33 25%, ${flow.selectedClub.value.accent_color}80 50%, ${flow.selectedClub.value.accent_color}33 75%, transparent 100%)` }"
          />
          <div class="relative flex items-center gap-3">
            <img
              v-if="flow.selectedClub.value?.logo_path"
              :src="flow.clubLogoUrl(flow.selectedClub.value.logo_path) ?? undefined"
              :alt="flow.selectedClub.value?.name ?? ''"
              class="h-11 w-11 md:h-12 md:w-12 object-contain flex-shrink-0 rounded-lg"
            />
            <div>
              <h2 class="font-heading text-xl md:text-[22px] font-extrabold uppercase tracking-[0.02em] leading-tight">
                {{ flow.selectedClub.value?.name ?? '' }}
              </h2>
            <p v-if="flow.selectedClub.value?.slogan" class="flex items-center gap-2 text-sm italic text-gray-500 mt-1">
              <span
                v-if="flow.selectedClub.value?.accent_color"
                class="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                :style="{ background: flow.selectedClub.value.accent_color }"
              />
              {{ flow.selectedClub.value.slogan }}
            </p>
            </div>
          </div>
          <div v-if="flow.productCategories.value.length" class="relative flex gap-2 flex-wrap">
            <button
              type="button"
              class="px-4 py-1.5 rounded-full border text-[13px] font-medium transition"
              :class="
                flow.activeCategory.value === null
                  ? 'text-white'
                  : 'bg-white dark:bg-sidebar-surface border-gray-200 dark:border-sidebar text-gray-500 hover:text-accent hover:border-accent'
              "
              :style="flow.activeCategory.value === null ? { background: accentCss, borderColor: accentCss } : undefined"
              @click="flow.activeCategory.value = null"
            >
              {{ t('storefront.home.filterAll') }}
            </button>
            <button
              v-for="c in flow.productCategories.value"
              :key="c"
              type="button"
              class="px-4 py-1.5 rounded-full border text-[13px] font-medium transition capitalize"
              :class="
                flow.activeCategory.value === c
                  ? 'text-white'
                  : 'bg-white dark:bg-sidebar-surface border-gray-200 dark:border-sidebar text-gray-500 hover:text-accent hover:border-accent'
              "
              :style="flow.activeCategory.value === c ? { background: accentCss, borderColor: accentCss } : undefined"
              @click="flow.activeCategory.value = c"
            >
              {{ c }}
            </button>
          </div>
        </div>
        <div
          v-if="flow.selectedClub.value?.accent_color"
          class="h-0.5 rounded-full"
          :style="{ background: `linear-gradient(to right, ${flow.selectedClub.value.accent_color}cc 0%, ${flow.selectedClub.value.accent_color}77 25%, ${flow.selectedClub.value.accent_color}33 50%, ${flow.selectedClub.value.accent_color}77 75%, ${flow.selectedClub.value.accent_color}cc 100%)` }"
        />
      </div>

      <div v-if="!flow.filteredProducts.value.length" class="py-16 text-center text-gray-500">
        <UIcon name="i-lucide-package" class="w-12 h-12 mx-auto mb-4 opacity-40" />
        <h3 class="font-heading font-bold text-lg mb-2">{{ t('storefront.home.noProducts') }}</h3>
        <p class="text-sm">{{ t('storefront.home.noProductsHint') }}</p>
      </div>

      <div v-else class="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-7 gap-3">
        <NuxtLink
          v-for="(p, i) in flow.filteredProducts.value"
          :key="p.id"
          :to="`/product/${p.id}`"
          class="pcard home-product-card group bg-white dark:bg-sidebar-surface rounded-2xl overflow-hidden border border-gray-200 dark:border-sidebar transition-all hover:-translate-y-1.5 hover:border-transparent cursor-pointer relative no-underline text-inherit"
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
            <span
              v-else-if="p.flocking_kind !== 'none'"
              class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-brand-green text-white"
            >
              {{ t('storefront.home.badgeFlocking') }}
            </span>
            <span
              v-else-if="p.is_pack"
              class="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-brand-purple text-white"
            >
              {{ t('storefront.home.badgePack') }}
            </span>

            <span class="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-full bg-ink text-white flex items-center justify-center text-sm shadow-lg opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all">
              +
            </span>

            <div
              class="absolute bottom-0 left-0 right-0 h-0.5 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-center"
              :style="{ backgroundColor: accentCss }"
            />
          </div>
          <div class="p-2.5">
            <div class="text-[9px] text-gray-400 tracking-[0.5px] uppercase mb-0.5">REF: {{ p.reference }}</div>
            <div class="font-semibold text-[12px] leading-[1.3] mb-1 line-clamp-2">
              {{ p.name[locale as 'fr' | 'en'] ?? p.name.fr }}
            </div>
            <div v-if="p.category" class="text-[10px] text-gray-500 mb-1.5 capitalize">{{ p.category }}</div>
            <div class="flex items-center justify-between gap-1 flex-wrap">
              <div class="font-heading font-extrabold text-sm">
                <span :style="flow.clubDiscountPct(p) > 0 ? { color: accentCss } : undefined">
                  {{ flow.fmt(flow.finalPrice(p)) }}
                </span>
                <span v-if="flow.displayDiscount(p) > 0" class="line-through text-[10px] text-gray-400 font-normal ml-1">
                  {{ flow.fmt(Number(p.selling_price)) }}
                </span>
              </div>
              <div class="flex gap-0.5 flex-wrap">
                <span
                  v-for="s in flow.productSizes(p)"
                  :key="s"
                  class="w-4 h-4 rounded border border-gray-200 dark:border-sidebar flex items-center justify-center text-[8px] font-semibold text-gray-500"
                >
                  {{ s }}
                </span>
              </div>
            </div>
          </div>
        </NuxtLink>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
/* * Accent ring on hover — uses the club colour via v-bind. */
.pcard:hover {
  box-shadow:
    0 0 0 2px v-bind(accentCss),
    0 12px 24px rgba(0, 0, 0, 0.08),
    0 4px 8px rgba(0, 0, 0, 0.06);
}
</style>
