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
      <div class="hero relative flex flex-col lg:flex-row items-stretch min-h-[360px] overflow-hidden">
        <!-- Left panel -->
        <div class="flex-1 bg-ink text-white px-6 md:px-10 py-12 flex flex-col justify-center">
          <div class="hero-eyebrow flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] uppercase text-white/55 mb-3.5">
            {{ t('storefront.home.heroEyebrow') }}
          </div>
          <h1 class="font-heading text-4xl md:text-5xl lg:text-[52px] font-extrabold leading-[1.0] uppercase mb-[18px]">
            {{ t('storefront.home.heroTitlePre') }}
            <em class="not-italic text-accent">{{ t('storefront.home.heroTitleAccent') }}</em>
            {{ t('storefront.home.heroTitlePost') }}
          </h1>
          <p class="text-white/70 text-[15px] leading-[1.65] mb-8 max-w-[400px]">
            {{ t('storefront.home.heroSubtitle') }}
          </p>

          <div class="flex gap-10 pt-[26px] border-t border-white/15">
            <div>
              <div class="font-heading text-[30px] font-extrabold leading-none">
                {{ statsClubs }}<span class="text-accent">+</span>
              </div>
              <div class="text-[10px] text-white/45 uppercase tracking-[0.1em] mt-1.5 font-semibold">
                {{ t('storefront.home.statsClubs') }}
              </div>
            </div>
            <div>
              <div class="font-heading text-[30px] font-extrabold leading-none">
                {{ statsProducts }}<span class="text-accent">+</span>
              </div>
              <div class="text-[10px] text-white/45 uppercase tracking-[0.1em] mt-1.5 font-semibold">
                {{ t('storefront.home.statsProducts') }}
              </div>
            </div>
            <div>
              <div class="font-heading text-[30px] font-extrabold leading-none">
                {{ statsSports }}
              </div>
              <div class="text-[10px] text-white/45 uppercase tracking-[0.1em] mt-1.5 font-semibold">
                {{ t('storefront.home.statsSports') }}
              </div>
            </div>
          </div>
        </div>

        <!-- Right panel — #0f1a40, carousel sits inside as a square -->
        <div class="relative flex-shrink-0 w-full lg:w-[500px] min-h-[300px] lg:min-h-0 bg-ink overflow-hidden flex items-center justify-center p-5 md:p-6">
          <HomeHeroCarousel v-if="slides.length" :slides="slides" />
          <div v-else class="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
            {{ t('admin.carousel.preview.empty') }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hero-eyebrow::before {
  content: '';
  width: 24px;
  height: 2px;
  background: #e8251f;
  display: inline-block;
}
</style>
