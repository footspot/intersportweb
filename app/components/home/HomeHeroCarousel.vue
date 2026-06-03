<script setup lang="ts">
// * Hero carousel — sits on the right of the navy hero banner.
// * Each image is shown 3s; on display it starts zoomed in (scale 1.18) and
// * quickly settles to its default size (scale 1) — a "zoom → dezoom" reveal.
import type { HomeSlide } from '~/stores/carousel'

interface Props {
  slides: HomeSlide[]
}
const props = defineProps<Props>()

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
  // * 3s per image, per the spec.
  timer = setInterval(() => {
    if (!paused.value) next()
  }, 3000)
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
</script>

<template>
  <div
    v-if="slides.length"
    class="hero-carousel relative w-full max-w-[440px] aspect-square rounded-lg overflow-hidden shadow-card-lg ring-1 ring-white/10"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <!-- * Keyed image re-runs the zoom-settle keyframe on every slide change. -->
    <Transition name="hc-fade">
      <div :key="index" class="absolute inset-0">
        <img
          v-if="imageUrl(slides[index].image_path)"
          :src="imageUrl(slides[index].image_path)!"
          :alt="slides[index].title ?? ''"
          class="hc-img w-full h-full object-cover"
        >
        <div
          v-if="slides[index].title"
          class="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 to-transparent"
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
/* * "Dive in" reveal: constant-speed zoom-out (linear) that stops dead at rest —
 * the image falls straight in and halts net, with no ease-in/out glide. */
.hc-img {
  animation: hcZoomSettle 0.25s linear both;
  transform-origin: center;
}
@keyframes hcZoomSettle {
  from {
    transform: scale(4);
  }
  to {
    transform: scale(1);
  }
}

/* * Cross-fade between slides so the zoom isn't a hard cut. */
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
  .hc-img {
    animation: none;
  }
  .hc-fade-enter-active,
  .hc-fade-leave-active {
    transition: none;
  }
}
</style>
