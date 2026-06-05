<script setup lang="ts">
// * Navy hero banner — split in two like the mockup: left panel (#1b2a6b) holds
// * the copy + stats, right panel (#0f1a40) holds the auto-zooming carousel.
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t } = flow
</script>

<template>
  <section class="hero relative flex flex-col lg:flex-row items-stretch min-h-[400px] overflow-hidden">
    <!-- Left panel — copy + stats -->
    <div class="hero-left flex-1 bg-ink text-white px-6 md:px-12 py-12 md:py-14 flex flex-col justify-center">
      <div class="hero-eyebrow flex items-center gap-2 text-[11px] font-bold tracking-[0.15em] uppercase text-white/55 mb-3.5">
        {{ t('storefront.home.heroEyebrow') }}
      </div>

      <h1 class="font-heading text-4xl md:text-5xl lg:text-[56px] font-extrabold leading-[1.0] uppercase mb-[18px]">
        {{ t('storefront.home.heroTitlePre') }}
        <em class="not-italic text-accent">{{ t('storefront.home.heroTitleAccent') }}</em>
        {{ t('storefront.home.heroTitlePost') }}
      </h1>

      <p class="text-[15px] text-white/70 leading-[1.65] max-w-[400px] mb-8">
        {{ t('storefront.home.heroSubtitle') }}
      </p>

      <button
        type="button"
        class="hero-btn inline-flex items-center gap-2.5 bg-accent text-white font-heading font-bold text-base uppercase tracking-[0.05em] px-7 py-3 rounded-lg w-fit transition-transform hover:-translate-y-0.5"
        @click="flow.pickEntry('shop')"
      >
        <UIcon name="i-lucide-arrow-right" class="w-[18px] h-[18px]" />
        {{ t('storefront.home.heroButton') }}
      </button>

      <div class="flex gap-10 mt-11 pt-[26px] border-t border-white/15">
        <div>
          <div class="font-heading text-[30px] font-extrabold leading-none">
            {{ flow.stats.value.clubs }}<span class="text-accent">+</span>
          </div>
          <div class="text-[10px] font-semibold tracking-[0.1em] uppercase text-white/45 mt-1.5">
            {{ t('storefront.home.statsClubs') }}
          </div>
        </div>
        <div>
          <div class="font-heading text-[30px] font-extrabold leading-none">
            {{ flow.stats.value.products }}<span class="text-accent">+</span>
          </div>
          <div class="text-[10px] font-semibold tracking-[0.1em] uppercase text-white/45 mt-1.5">
            {{ t('storefront.home.statsProducts') }}
          </div>
        </div>
        <div>
          <div class="font-heading text-[30px] font-extrabold leading-none">
            {{ flow.stats.value.sports }}
          </div>
          <div class="text-[10px] font-semibold tracking-[0.1em] uppercase text-white/45 mt-1.5">
            {{ t('storefront.home.statsSports') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Right panel — #0f1a40, carousel sits inside as a square -->
    <div class="hero-right relative flex-shrink-0 w-full lg:w-[520px] min-h-[320px] lg:min-h-0 bg-ink overflow-hidden flex items-center justify-center p-5 md:p-6">
      <HomeHeroCarousel :slides="flow.carousel.sorted" :interval="flow.siteSettings.carouselAutoplaySeconds" />
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
.hero-btn {
  box-shadow: 0 10px 24px -8px rgba(232, 37, 31, 0.6);
}
</style>
