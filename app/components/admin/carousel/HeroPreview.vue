<script setup lang="ts">
// * Live preview of the storefront hero banner. Replicates the markup &
// * styling used in pages/index.vue so the admin can see how their slides
// * render in context (left-side text/stats + right-side carousel).
import type { HomeSlide } from '~/stores/carousel'

interface Props {
  slides: HomeSlide[]
  statsClubs: number
  statsProducts: number
  statsSports: number
}
defineProps<Props>()

const { t } = useI18n()
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <UIcon name="i-lucide-monitor" class="w-4 h-4" />
        <span>{{ t('admin.carousel.preview.label') }}</span>
      </div>
      <span class="text-xs text-gray-400 hidden sm:inline">
        {{ t('admin.carousel.preview.hint') }}
      </span>
    </div>

    <div class="rounded-card overflow-hidden border border-gray-200 dark:border-sidebar shadow-card-sm pointer-events-none select-none">
      <div class="hero relative overflow-hidden min-h-[400px] lg:min-h-[480px] flex items-center px-6 md:px-10 py-14 md:py-20 bg-[#0a0e27] text-white border-y-2 border-[#7b9fff]">
        <div class="hero-grid absolute inset-0 pointer-events-none"></div>
        <div class="hero-radial absolute inset-0 pointer-events-none"></div>

        <div class="relative z-[2] max-w-[600px]">
          <h1 class="font-heading text-4xl md:text-5xl lg:text-[52px] font-black leading-[1.1] tracking-[-1.5px] mb-4">
            {{ t('storefront.home.heroTitlePre') }}
            <span class="bg-gradient-to-br from-[#3a5fff] to-[#7b9fff] bg-clip-text text-transparent">
              {{ t('storefront.home.heroTitleAccent') }}
            </span>
            {{ t('storefront.home.heroTitlePost') }}
          </h1>
          <p class="text-white/60 text-base leading-[1.7] mb-8 max-w-lg">
            {{ t('storefront.home.heroSubtitle') }}
          </p>

          <div class="flex gap-10">
            <div>
              <div class="font-heading text-2xl md:text-[28px] font-extrabold">
                {{ statsClubs }}<span class="text-[#3a5fff]">+</span>
              </div>
              <div class="text-[11px] text-white/40 uppercase tracking-[1px] mt-1">
                {{ t('storefront.home.statsClubs') }}
              </div>
            </div>
            <div>
              <div class="font-heading text-2xl md:text-[28px] font-extrabold">
                {{ statsProducts }}<span class="text-[#3a5fff]">+</span>
              </div>
              <div class="text-[11px] text-white/40 uppercase tracking-[1px] mt-1">
                {{ t('storefront.home.statsProducts') }}
              </div>
            </div>
            <div>
              <div class="font-heading text-2xl md:text-[28px] font-extrabold">
                {{ statsSports }}
              </div>
              <div class="text-[11px] text-white/40 uppercase tracking-[1px] mt-1">
                {{ t('storefront.home.statsSports') }}
              </div>
            </div>
          </div>
        </div>

        <HomeHeroCarousel v-if="slides.length" :slides="slides" />
        <div
          v-else
          class="hidden lg:flex absolute right-10 top-1/2 -translate-y-1/2 w-[500px] h-[400px] rounded-2xl border border-dashed border-white/15 items-center justify-center text-white/40 text-sm"
        >
          {{ t('admin.carousel.preview.empty') }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-grid {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
}
.hero-radial {
  background:
    radial-gradient(ellipse 600px 400px at 20% 50%, rgba(3, 49, 249, 0.25), transparent),
    radial-gradient(ellipse 400px 300px at 80% 30%, rgba(227, 11, 12, 0.15), transparent);
}
</style>
