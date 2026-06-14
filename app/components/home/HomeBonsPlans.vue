<script setup lang="ts">
// * "Les bons plans du moment" — admin hand-picked product carousel. Renders
// * only when the section is enabled and at least one (visible) product is
// * featured. Horizontal scroll with snap + prev/next arrows; each card links to
// * the product page. Roster + title/visibility are managed from
// * /admin/personalization → "Bons plans".
import type { Product } from '~/stores/products'
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t, locale } = flow

const title = computed(
  () => flow.siteSettings.bonsPlansTitle || t('storefront.home.bonsPlans.title'),
)

const scroller = ref<HTMLElement | null>(null)

// * Scroll roughly one "page" (the visible width) in either direction.
function scrollBy(dir: 1 | -1) {
  const el = scroller.value
  if (!el) return
  el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: 'smooth' })
}

function productName(p: Product) {
  return p.name[locale.value as 'fr' | 'en'] ?? p.name.fr
}
</script>

<template>
  <section
    v-if="flow.bonsPlansVisible.value"
    class="bons-plans px-6 md:px-10 lg:px-12 py-14 bg-page dark:bg-sidebar-bg"
    aria-label="Les bons plans du moment"
  >
    <!-- * Header: eyebrow + big title, with prev/next arrows on the right -->
    <div class="flex items-end justify-between gap-4 mb-7 flex-wrap">
      <div>
        <div class="flex items-center gap-2 mb-1.5">
          <span class="h-0.5 w-7 rounded-full bg-accent" />
          <span class="text-[11px] font-extrabold uppercase tracking-[0.22em] text-accent">
            {{ t('storefront.home.bonsPlans.eyebrow') }}
          </span>
        </div>
        <h2 class="font-heading text-3xl md:text-[44px] leading-[0.95] font-extrabold uppercase tracking-[0.01em] text-ink dark:text-white">
          {{ title }}
        </h2>
      </div>

      <div class="flex items-center gap-2.5">
        <button
          type="button"
          class="bp-arrow"
          :aria-label="t('common.previous')"
          @click="scrollBy(-1)"
        >
          <UIcon name="i-lucide-chevron-left" class="w-5 h-5" />
        </button>
        <button
          type="button"
          class="bp-arrow"
          :aria-label="t('common.next')"
          @click="scrollBy(1)"
        >
          <UIcon name="i-lucide-chevron-right" class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- * Horizontal snap-scroll track -->
    <div ref="scroller" class="bp-track flex gap-4 overflow-x-auto pt-2 pb-3 -mx-1 px-1">
      <NuxtLink
        v-for="p in flow.bonsPlansProducts.value"
        :key="p.id"
        :to="`/product/${p.id}`"
        class="bp-card group bg-white dark:bg-sidebar-surface rounded-2xl overflow-hidden border border-gray-200 dark:border-sidebar no-underline text-inherit transition-all hover:-translate-y-1 hover:shadow-card-lg hover:border-accent/50"
      >
        <!-- * Visual -->
        <div class="relative aspect-[4/3] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface flex items-center justify-center overflow-hidden">
          <img
            v-if="flow.productImageUrl(p.images[0]?.image_path ?? null)"
            :src="flow.productImageUrl(p.images[0]?.image_path ?? null)!"
            class="w-full h-full object-contain p-3"
            :alt="productName(p)"
          >
          <span v-else class="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
            {{ t('storefront.home.bonsPlans.placeholder') }}
          </span>

          <!-- * Category badge -->
          <span
            v-if="p.category"
            class="absolute top-3 left-3 px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase bg-ink text-white"
          >
            {{ p.category }}
          </span>
          <!-- * Discount badge -->
          <span
            v-if="flow.displayDiscount(p) > 0"
            class="absolute top-3 right-3 px-2 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase bg-accent text-white"
          >
            -{{ flow.displayDiscount(p) }}%
          </span>
        </div>

        <!-- * Body -->
        <div class="p-4">
          <div v-if="p.category" class="text-[10px] text-gray-400 uppercase tracking-[0.16em] mb-1">
            {{ p.category }}
          </div>
          <h3 class="font-heading text-lg font-bold uppercase tracking-[0.01em] text-ink dark:text-white leading-tight line-clamp-1 mb-3">
            {{ productName(p) }}
          </h3>
          <div class="flex items-center justify-between gap-2">
            <div class="font-heading font-extrabold">
              <span
                v-if="flow.displayDiscount(p) > 0"
                class="line-through text-gray-400 text-xs font-normal mr-1.5"
              >
                {{ flow.fmt(Number(p.selling_price)) }}
              </span>
              <span class="text-accent text-xl">{{ flow.fmt(flow.finalPrice(p)) }}</span>
            </div>
            <span class="bp-add">
              {{ t('storefront.home.bonsPlans.add') }}
              <UIcon name="i-lucide-plus" class="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.bp-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 9999px;
  border: 1px solid rgba(22, 65, 148, 0.18);
  color: var(--color-ink, #164194);
  background: #fff;
  transition: background 0.18s, color 0.18s, border-color 0.18s;
}
.bp-arrow:hover {
  background: var(--color-ink, #164194);
  border-color: var(--color-ink, #164194);
  color: #fff;
}
.dark .bp-arrow {
  background: var(--color-sidebar-surface);
  border-color: rgba(255, 255, 255, 0.14);
  color: #fff;
}

/* * Fixed-width cards that snap as the track scrolls. */
.bp-card {
  flex: 0 0 auto;
  width: 260px;
  scroll-snap-align: start;
}
.bp-track {
  scroll-snap-type: x mandatory;
  scrollbar-width: thin;
}

.bp-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border-radius: 9px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #fff;
  background: var(--color-ink, #164194);
  transition: background 0.18s;
}
.group:hover .bp-add {
  background: var(--color-accent, #e30613);
}

@media (max-width: 620px) {
  .bp-card {
    width: 210px;
  }
}
</style>
