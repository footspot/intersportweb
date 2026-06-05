<script setup lang="ts">
// * Hero carousel — sits on the right of the navy hero banner.
// * Each image is shown 3s; on display it starts zoomed in (scale 1.18) and
// * quickly settles to its default size (scale 1) — a "zoom → dezoom" reveal.
import type { HomeSlide } from '~/stores/carousel'

interface Props {
  slides: HomeSlide[]
  // * Dwell time per slide, in seconds (admin-configurable). Defaults to 3s.
  interval?: number
}
const props = withDefaults(defineProps<Props>(), { interval: 3 })

const client = useSupabaseClient()
const index = ref(0)
const paused = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

function imageUrl(path: string): string | null {
  const { data } = client.storage.from('home-carousel').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function next() {
  if (props.slides.length === 0) return
  index.value = (index.value + 1) % props.slides.length
}
function go(i: number) {
  index.value = i
}

function start() {
  stop()
  if (props.slides.length <= 1) return
  // * Admin-configured dwell time (seconds → ms), clamped to a sane floor.
  const ms = Math.max(1, props.interval || 3) * 1000
  timer = setInterval(() => {
    if (!paused.value) next()
  }, ms)
}
function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onMounted(start)
onBeforeUnmount(stop)

watch(
  () => props.slides.length,
  () => {
    index.value = 0
    start()
  },
)
// * Restart the timer when the admin changes the dwell time (live preview).
watch(() => props.interval, start)
</script>

<template>
  <div
    v-if="slides.length"
    class="hero-carousel relative w-full max-w-[440px] aspect-square rounded-lg overflow-hidden shadow-card-lg ring-1 ring-white/10"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <!-- * Keyed wrapper re-runs the per-slide entrance keyframe on every change. -->
    <Transition name="hc-fade">
      <div :key="index" class="absolute inset-0" :class="`hc-mode-${slides[index].animation ?? 'zoom'}`">
        <!-- * Wrapper carries the horizontal axis; the img carries vertical + clip.
             Two independent easings = a smooth curved trajectory (no stutter). -->
        <div class="hc-ballx absolute inset-0">
          <img
            v-if="imageUrl(slides[index].image_path)"
            :src="imageUrl(slides[index].image_path)!"
            :alt="slides[index].title ?? ''"
            class="hc-img w-full h-full object-cover"
          >
        </div>
        <div
          v-if="slides[index].title"
          class="hc-caption absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 to-transparent"
        >
          <div class="font-heading font-bold text-white text-xl leading-tight uppercase tracking-wide">
            {{ slides[index].title }}
          </div>
        </div>
      </div>
    </Transition>

    <div
      v-if="slides.length > 1"
      class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10"
    >
      <button
        v-for="(_, i) in slides"
        :key="i"
        type="button"
        :aria-label="`Slide ${i + 1}`"
        class="h-2 rounded-full transition-all"
        :class="i === index ? 'bg-white w-6' : 'bg-white/40 w-2 hover:bg-white/70'"
        @click="go(i)"
      />
    </div>
  </div>
</template>

<style scoped>
.hc-img {
  transform-origin: center;
  will-change: transform, clip-path;
}
.hc-ballx {
  will-change: transform;
}

/* * ── Mode: zoom (default) ──
 * "Dive in" reveal: constant-speed zoom-out (linear) that stops dead at rest. */
.hc-mode-zoom .hc-img {
  animation: hcZoomSettle 0.25s linear both;
}
@keyframes hcZoomSettle {
  from {
    transform: scale(4);
  }
  to {
    transform: scale(1);
  }
}

/* * ── Mode: soccer ──
 * Smooth arc from the bottom-left to dead-centre. Horizontal travel (wrapper)
 * and vertical travel (img) use DIFFERENT easings, so the combined path is a
 * genuine curve — not a straight diagonal and not a stuttering polyline. The
 * image stays upright (no spin) and keeps a centred crop. The clip circle starts
 * tiny, grows to ~20% as the ball reaches the target, then blooms to full size. */
.hc-mode-soccer .hc-ballx {
  /* * Both axes accelerate the whole way (ease-in) — faster and faster to the
     target, then bloom. Different curves on the two axes keep the path bowed. */
  animation: hcSoccerX 1.05s cubic-bezier(0.5, 0.12, 1, 0.4) both;
}
.hc-mode-soccer .hc-img {
  animation: hcSoccerY 1.05s cubic-bezier(0.33, 0.18, 0.85, 0.4) both;
}
@keyframes hcSoccerX {
  0% {
    transform: translateX(-95%);
  }
  64%,
  100% {
    transform: translateX(0);
  }
}
@keyframes hcSoccerY {
  0% {
    transform: translateY(95%);
    clip-path: circle(3% at 50% 50%);
    opacity: 0;
  }
  6% {
    opacity: 1;
  }
  64% {
    transform: translateY(0);
    clip-path: circle(20% at 50% 50%);
    /* * Bloom starts the instant the ball lands — snappy ease-out, no lingering. */
    animation-timing-function: cubic-bezier(0.16, 0.9, 0.3, 1);
  }
  100% {
    transform: translateY(0);
    clip-path: circle(78% at 50% 50%);
  }
}

/* * ── Mode: basketball ──
 * Smooth arc from the bottom-right up to the target (horizontally centred, 25%
 * down from the top). Same two-axis technique. The ball touches the target at
 * ~20% size, then blooms to full while settling down into place. */
.hc-mode-basketball .hc-ballx {
  /* * Both axes accelerate the whole way (ease-in) — faster and faster to the
     target, then bloom. Different curves on the two axes keep the path bowed. */
  animation: hcBasketX 1.15s cubic-bezier(0.5, 0.12, 1, 0.4) both;
}
.hc-mode-basketball .hc-img {
  animation: hcBasketY 1.15s cubic-bezier(0.33, 0.18, 0.85, 0.4) both;
}
@keyframes hcBasketX {
  0% {
    transform: translateX(95%);
  }
  64%,
  100% {
    transform: translateX(0);
  }
}
@keyframes hcBasketY {
  0% {
    /* * Start off the top-right corner (paired with hcBasketX's +95%). */
    transform: translateY(-95%);
    clip-path: circle(3% at 50% 50%);
    opacity: 0;
  }
  6% {
    opacity: 1;
  }
  64% {
    /* * Land just above the centre, then bloom. */
    transform: translateY(-15%);
    clip-path: circle(20% at 50% 50%);
    /* * Bloom starts the instant the ball reaches the target — snappy ease-out. */
    animation-timing-function: cubic-bezier(0.16, 0.9, 0.3, 1);
  }
  100% {
    transform: translateY(0);
    clip-path: circle(78% at 50% 50%);
  }
}

/* * For the ball modes, hold the caption back until the image has settled. */
.hc-mode-soccer .hc-caption,
.hc-mode-basketball .hc-caption {
  animation: hcCaptionIn 0.4s ease both;
  animation-delay: 1s;
}
@keyframes hcCaptionIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* * Cross-fade between slides so the entrance isn't a hard cut. */
.hc-fade-enter-active,
.hc-fade-leave-active {
  transition: opacity 0.6s ease;
}
.hc-fade-enter-from,
.hc-fade-leave-to {
  opacity: 0;
}
.hc-fade-leave-active {
  position: absolute;
  inset: 0;
}

@media (prefers-reduced-motion: reduce) {
  .hc-ballx,
  .hc-img,
  .hc-caption {
    animation: none;
  }
  .hc-fade-enter-active,
  .hc-fade-leave-active {
    transition: none;
  }
}
</style>
