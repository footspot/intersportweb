<script setup lang="ts">
// * Live preview of the storefront hero — the redesigned "stadium" banner with
// * the admin's slides rendered as the throwable card deck (preview mode, so
// * clicks don't navigate).
import type { HomeSlide } from '~/stores/carousel'
import type { HeroMedia } from '~/stores/heroBanner'

interface Props {
  slides: HomeSlide[]
  // * Full-bleed background media (images + videos), mirrors the live hero.
  bannerItems?: HeroMedia[]
  // * Reflects the admin's show/hide-cards toggle live.
  showCards?: boolean
  // * Kept for API compatibility with the manager; the new hero has no stats.
  statsClubs?: number
  statsProducts?: number
  statsSports?: number
  interval?: number
}
withDefaults(defineProps<Props>(), { interval: 3, showCards: true, bannerItems: () => [] })

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
      <div class="preview-hero relative overflow-hidden min-h-[360px] flex items-center justify-center px-6 py-10">
        <div class="preview-grad"></div>
        <!-- * Full-bleed media carousel (admin-managed images + videos) -->
        <HomeHeroBanner
          v-if="bannerItems.length"
          :items="bannerItems"
          :interval="interval"
          class="z-0"
        />
        <!-- * Legibility scrim over the media so the deck reads -->
        <div v-if="bannerItems.length" class="preview-scrim"></div>
        <div class="preview-stripes"></div>
        <HomeHeroDeck
          v-if="showCards && slides.length"
          :slides="slides"
          :interval="interval"
          preview
          class="relative z-[2]"
        />
        <div v-else-if="!showCards" class="relative z-[2] flex flex-col items-center gap-1 text-white/40 text-sm">
          <UIcon name="i-lucide-eye-off" class="w-5 h-5" />
          {{ t('admin.carousel.preview.cardsHidden') }}
        </div>
        <div v-else class="relative z-[2] text-white/40 text-sm">
          {{ t('admin.carousel.preview.empty') }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.preview-hero {
  background: #05081a;
}
.preview-grad {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(130% 120% at 82% -10%, #1e51a8 0%, #164194 40%, #0e2a60 80%);
}
.preview-stripes {
  position: absolute;
  inset: -30% -15%;
  z-index: 0;
  opacity: 0.5;
  background: repeating-linear-gradient(-58deg, transparent 0 30px, rgba(255, 255, 255, 0.04) 30px 32px);
}
.preview-scrim {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.62) 0%,
    rgba(0, 0, 0, 0.18) 38%,
    rgba(0, 0, 0, 0.34) 100%
  );
}
</style>
