<script setup lang="ts">
// * "Les bons plans du moment" — admin hand-picked product carousel. Renders
// * only when the section is enabled and at least one (visible) product is
// * featured. The track scrolls on its own, infinitely (a duplicated list driven
// * by rAF), pausing on hover so cards stay readable/clickable. Holding an arrow
// * accelerates the scroll in that direction; releasing returns to the gentle
// * base speed. Roster + title/visibility are managed from
// * /admin/personalization → "Bons plans".
import type { Product } from '~/stores/products'
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t, locale } = flow

const title = computed(
  () => flow.siteSettings.bonsPlansTitle || t('storefront.home.bonsPlans.title'),
)

const products = computed(() => flow.bonsPlansProducts.value)

// * Doubled so wrapping at the half-width loops seamlessly.
const loop = computed(() => [...products.value, ...products.value])

function productName(p: Product) {
  return p.name[locale.value as 'fr' | 'en'] ?? p.name.fr
}

// ── Infinite scroll engine (rAF) ──
const track = ref<HTMLElement | null>(null)
const paused = ref(false) // * hover pause
const reverse = ref(false) // * current drift direction
const boosting = ref(false) // * an arrow is being held

const BASE_PXS = 42 // * gentle idle speed (px/s)
const BOOST_PXS = 280 // * speed while an arrow is held

let raf = 0
let last = 0
let offset = 0

function frame(ts: number) {
  const dt = last ? (ts - last) / 1000 : 0
  last = ts
  const el = track.value
  if (el && !paused.value) {
    const half = el.scrollWidth / 2 || 1
    const speed = (boosting.value ? BOOST_PXS : BASE_PXS) * (reverse.value ? -1 : 1)
    offset += speed * dt
    if (offset >= half) offset -= half
    else if (offset < 0) offset += half
    el.style.transform = `translateX(${-offset}px)`
  }
  raf = requestAnimationFrame(frame)
}

// * Hold an arrow → boost in that direction; release → keep direction, base speed.
function press(dir: 1 | -1) {
  reverse.value = dir === -1
  boosting.value = true
}
function release() {
  boosting.value = false
}

onMounted(() => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => cancelAnimationFrame(raf))
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
          :class="{ 'is-active': boosting && reverse }"
          :aria-label="t('common.previous')"
          @pointerdown.prevent="press(-1)"
          @pointerup="release"
          @pointerleave="release"
          @pointercancel="release"
        >
          <UIcon name="i-lucide-chevron-left" class="w-5 h-5" />
        </button>
        <button
          type="button"
          class="bp-arrow"
          :class="{ 'is-active': boosting && !reverse }"
          :aria-label="t('common.next')"
          @pointerdown.prevent="press(1)"
          @pointerup="release"
          @pointerleave="release"
          @pointercancel="release"
        >
          <UIcon name="i-lucide-chevron-right" class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- * Infinite auto-scrolling track (duplicated list, driven by rAF) -->
    <div class="bp-viewport" @mouseenter="paused = true" @mouseleave="paused = false">
      <div ref="track" class="bp-track">
        <NuxtLink
          v-for="(p, i) in loop"
          :key="`${p.id}-${i}`"
          :to="`/product/${p.id}`"
          :aria-hidden="i >= products.length ? 'true' : undefined"
          :tabindex="i >= products.length ? -1 : undefined"
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
.bp-arrow:hover,
.bp-arrow.is-active {
  background: var(--color-ink, #164194);
  border-color: var(--color-ink, #164194);
  color: #fff;
}
.dark .bp-arrow {
  background: var(--color-sidebar-surface);
  border-color: rgba(255, 255, 255, 0.14);
  color: #fff;
}

/* * Infinite marquee: viewport clips horizontally; vertical padding leaves room
 * for the card hover-lift + shadow (overflow:hidden would otherwise clip them). */
.bp-viewport {
  overflow: hidden;
  padding: 10px 0 26px;
}
.bp-track {
  display: flex;
  gap: 16px;
  width: max-content;
  will-change: transform;
}

/* * Fixed-width cards. */
.bp-card {
  flex: 0 0 auto;
  width: 260px;
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

/* * Reduced motion: stop the auto-scroll, fall back to manual horizontal scroll. */
@media (prefers-reduced-motion: reduce) {
  .bp-track {
    animation: none;
  }
  .bp-viewport {
    overflow-x: auto;
    scrollbar-width: thin;
  }
}
</style>
