<script setup lang="ts">
// * Hero — the redesigned "stadium" centerpiece (see design_handoff_accueil).
// * A near-black banner with a default navy radial gradient, moving diagonal
// * stripes, a cursor-following red glow, the admin-managed card deck, two
// * floating stickers, and a bottom word-marquee. The smoke band (separate
// * component) is pulled up over the hero's bottom edge by the page.
// *
// * First-launch brand intro: the smoke-and-logo clip plays once over the hero,
// * then dissipates to reveal the live shop. It never blocks — the rest of the
// * page stays interactive while it runs.
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t } = flow

// * Launch clip — admin-uploaded video (Carousel tab) or the bundled fallback.
const heroVideoSrc = computed(() => flow.siteSettings.heroVideoUrl || '/intro-intersport.mp4')

// * Bottom-marquee words (decorative). Duplicated thrice in the track for a
// * seamless loop; alternating items render as outline text.
const marqueeWords = computed(() => [
  t('storefront.home.heroMarquee1'),
  t('storefront.home.heroMarquee2'),
  t('storefront.home.heroMarquee3'),
  t('storefront.home.heroMarquee4'),
  t('storefront.home.heroMarquee5'),
  t('storefront.home.heroMarquee6'),
])

// * Whether the launch intro should play. Reduced-motion suppresses it.
function shouldPlayIntro() {
  if (!import.meta.client) return false
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  return !reduced
}

// * Start `true` on BOTH server and first client render so the intro covers the
// * hero from frame 1 — no flash of the shop, and the deck fans out hidden
// * behind it. Identical initial markup → no hydration mismatch. Reduced-motion
// * is handled in onMounted by removing the layer instantly (transition off).
const showIntro = ref(true)
// * Lets us drop the intro with no animation for reduced-motion users.
const introCss = ref(true)
const videoEl = ref<HTMLVideoElement | null>(null)
const heroEl = ref<HTMLElement | null>(null)
const glowEl = ref<HTMLElement | null>(null)

function endIntro() {
  if (!showIntro.value) return
  showIntro.value = false
}

// * Kick playback, retrying once — muted autoplay can be refused before the
// * `muted` property settles. We never tear the layer down on failure; the
// * smoke entrance still reads, and the safety timer (or @ended) closes it.
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

// * Red glow follows the cursor across the hero (parallax). Skipped on touch /
// * reduced-motion.
function onHeroPointer(e: PointerEvent) {
  const hero = heroEl.value
  const glow = glowEl.value
  if (!hero || !glow) return
  const r = hero.getBoundingClientRect()
  glow.style.right = r.width - (e.clientX - r.left) - 310 + 'px'
  glow.style.top = e.clientY - r.top - 310 + 'px'
}

onMounted(async () => {
  // * Reduced-motion: tear the intro down immediately, with no leave animation.
  if (!shouldPlayIntro()) {
    introCss.value = false
    showIntro.value = false
    return
  }
  await nextTick()
  await startPlayback()
  // * Safety net: if the clip never plays or never fires `ended`, don't leave the
  // * smoke layer hanging over the hero forever.
  setTimeout(endIntro, 14000)
})
</script>

<template>
  <section
    ref="heroEl"
    class="hero relative overflow-hidden text-white"
    @pointermove="onHeroPointer"
  >
    <!-- * Default navy radial background (fallback behind the media carousel) -->
    <div class="hero-grad"></div>
    <!-- * Full-bleed media carousel (admin-managed images + videos) -->
    <HomeHeroBanner
      v-if="flow.heroBanner.sorted.length"
      :items="flow.heroBanner.sorted"
      :interval="flow.siteSettings.carouselAutoplaySeconds"
      :active="!showIntro"
      class="z-0"
    />
    <!-- * Legibility scrim over the media so the deck + marquee read -->
    <div v-if="flow.heroBanner.sorted.length" class="hero-banner-scrim"></div>
    <!-- * Moving diagonal stripes -->
    <div class="hero-stripes"></div>
    <!-- * Cursor-following red glow -->
    <div ref="glowEl" class="hero-glow"></div>

    <div class="hero-in relative z-[2]">
      <HomeHeroDeck
        v-if="flow.siteSettings.heroShowCards && flow.carousel.sorted.length"
        :slides="flow.carousel.sorted"
        :interval="flow.siteSettings.carouselAutoplaySeconds"
        class="mx-auto"
      />
    </div>

    <!-- * Bottom word-marquee — hidden while the launch video plays -->
    <div class="hero-marq relative z-[2]" :class="{ 'hide-for-video': showIntro }">
      <div class="hm-track">
        <template v-for="rep in 3" :key="rep">
          <span
            v-for="(w, i) in marqueeWords"
            :key="`${rep}-${i}`"
            class="hm-item font-heading"
            :class="{ out: i % 2 === 1 }"
          >
            {{ w }}<span class="hm-dot"></span>
          </span>
        </template>
      </div>
    </div>

    <!-- * First-launch cinematic intro — smoke fills the hero, then clears to
         reveal the live shop. Covers only the hero band, so the page stays
         scrollable and the header stays clickable. -->
    <Transition name="intro-curtain" :css="introCss">
      <div v-if="showIntro" class="intro-layer absolute inset-0 z-20">
        <video
          ref="videoEl"
          class="absolute inset-0 h-full w-full object-cover"
          :src="heroVideoSrc"
          muted
          playsinline
          autoplay
          preload="auto"
          @loadeddata="startPlayback"
          @ended="endIntro"
          @error="endIntro"
        />
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-black/40"></div>
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
.hero {
  background: #05081a;
  isolation: isolate;
  min-height: 72vh;
  display: flex;
  flex-direction: column;
}
@media (max-width: 980px) {
  /* * Keep the banner a proper full-bleed band on mobile (was collapsing to a
   * thin strip). The flex column lets the media fill the height. */
  .hero {
    min-height: 64vh;
  }
}
@media (max-width: 620px) {
  .hero {
    min-height: 58vh;
  }
}
.hero-grad {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(
    130% 120% at 82% -10%,
    #1e51a8 0%,
    #164194 40%,
    #0e2a60 80%
  );
}
.hero-stripes {
  position: absolute;
  inset: -30% -15%;
  z-index: 0;
  opacity: 0.5;
  background: repeating-linear-gradient(
    -58deg,
    transparent 0 30px,
    rgba(255, 255, 255, 0.04) 30px 32px
  );
  animation: slidestripes 20s linear infinite;
}
@keyframes slidestripes {
  to {
    transform: translateX(64px);
  }
}
.hero-banner-scrim {
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
.hero-glow {
  position: absolute;
  z-index: 0;
  width: 620px;
  height: 620px;
  right: -150px;
  top: -180px;
  background: radial-gradient(circle, var(--color-accent) 0%, transparent 62%);
  opacity: 0.26;
  filter: blur(14px);
  pointer-events: none;
}

.hero-in {
  width: 100%;
  max-width: 1340px;
  margin: 0 auto;
  padding: 64px 40px 0;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}
@media (max-width: 980px) {
  .hero-in {
    padding: 48px 20px 0;
    min-height: 0;
  }
}

/* * Bottom word-marquee — pinned to the very bottom of the hero (flex column). */
.hero-marq {
  margin-top: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  overflow: hidden;
  background: rgba(0, 0, 0, 0.18);
  transition: opacity 0.5s ease, transform 0.5s ease;
}
.hero-marq.hide-for-video {
  opacity: 0;
  transform: translateY(24px);
  pointer-events: none;
}
.hm-track {
  display: flex;
  width: max-content;
  white-space: nowrap;
  animation: marq 22s linear infinite;
  padding: 12px 0;
}
.hm-item {
  font-weight: 900;
  font-size: 26px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.92);
  padding: 0 26px;
  display: inline-flex;
  align-items: center;
  gap: 26px;
}
.hm-item.out {
  color: transparent;
  -webkit-text-stroke: 1.4px rgba(255, 255, 255, 0.4);
}
.hm-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-accent);
}
@media (max-width: 620px) {
  .hm-item {
    font-size: 20px;
  }
}
@keyframes marq {
  to {
    transform: translateX(-50%);
  }
}

/* * Smoke gathers in / dissipates around the intro clip */
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
.intro-layer {
  background: #05081a;
}

@media (prefers-reduced-motion: reduce) {
  .hero-stripes,
  .hm-track {
    animation: none;
  }
}
</style>
