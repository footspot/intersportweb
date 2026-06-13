<script setup lang="ts">
// * Navy hero banner — split in two like the mockup: left panel (#1b2a6b) holds
// * the copy + stats, right panel (#0f1a40) holds the auto-zooming carousel.
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t } = flow

// * First-launch brand intro — the smoke-and-logo clip plays once per session
// * over the hero, then dissipates to reveal the live shop. It never blocks:
// * the rest of the page stays fully interactive while it runs.
// * Decide up-front (synchronously, before first paint) whether the intro should
// * play, so its layer is part of the hero's first render and covers the banner
// * from frame 1. Deferring this to onMounted let the banner paint first and the
// * curtain fade in over it — a visible ~1s flash of the shop before the video.
// * Plays on every load/reload (no once-per-session flag) — only reduced-motion
// * suppresses it.
function shouldPlayIntro() {
  if (!import.meta.client) return false
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return !reduced
}

const showIntro = ref(shouldPlayIntro())
const videoEl = ref<HTMLVideoElement | null>(null)

function endIntro() {
  if (!showIntro.value) return
  showIntro.value = false
}

// * Kick playback, retrying once — muted autoplay can be refused on the first
// * call before the `muted` property settles. We do NOT tear the layer down on
// * failure; the smoke entrance + first frame still read, and the safety timer
// * (or @ended) closes it.
async function startPlayback() {
  const v = videoEl.value
  if (!v) return
  v.muted = true
  v.defaultMuted = true
  try {
    await v.play()
  } catch {
    setTimeout(() => {
      v.muted = true
      v.play().catch(() => {})
    }, 120)
  }
}

onMounted(async () => {
  if (!showIntro.value) return
  await nextTick()
  await startPlayback()
  // * Safety net: if the clip never plays or never fires `ended`, don't leave the
  // * smoke layer hanging over the hero forever.
  setTimeout(endIntro, 14000)
})
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

    <!-- * First-launch cinematic intro — the smoke fills the whole hero, then
         * clears to reveal the live shop underneath. Covers only the hero band,
         * so the page stays scrollable and the header stays clickable. -->
    <Transition name="intro-curtain">
      <div
        v-if="showIntro"
        class="intro-layer absolute inset-0 z-20 bg-ink"
      >
        <video
          ref="videoEl"
          class="absolute inset-0 h-full w-full object-cover"
          src="/intro-intersport.mp4"
          muted
          playsinline
          autoplay
          preload="auto"
          @loadeddata="startPlayback"
          @ended="endIntro"
          @error="endIntro"
        />
        <!-- * Side scrim so the smoke bleeds into the navy copy panel seamlessly -->
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-ink/70 via-transparent to-ink/40"></div>
        <button
          type="button"
          class="absolute bottom-4 right-4 z-10 rounded-full bg-white/15 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-white/25"
          @click="endIntro"
        >
          {{ t('intro.skip') }}
        </button>
      </div>
    </Transition>
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
/* * Smoke gathers in — the layer eases up from a soft, slightly-zoomed blur so
 * the cut to the video is imperceptible against the hero behind it. */
.intro-curtain-enter-active {
  transition: opacity 1s ease, transform 1.1s cubic-bezier(0.22, 1, 0.36, 1),
    filter 1s ease;
  will-change: opacity, transform, filter;
}
.intro-curtain-enter-from {
  opacity: 0;
  transform: scale(1.06);
  filter: blur(16px);
}
/* * Smoke dissipates — on end the whole layer billows out (scale + blur + fade)
 * over a long, gentle curve, uncovering the live hero underneath like smoke
 * clearing in a stadium. */
.intro-curtain-leave-active {
  transition: opacity 1.4s ease, transform 1.4s cubic-bezier(0.22, 1, 0.36, 1),
    filter 1.4s ease;
  will-change: opacity, transform, filter;
}
.intro-curtain-leave-to {
  opacity: 0;
  transform: scale(1.14);
  filter: blur(18px);
}
</style>
