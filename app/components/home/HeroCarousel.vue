<script setup lang="ts">
// * Hero carousel — autoplay every 5s, manual dots, fade transition.
// * Title overlay only when the slide has a title.
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
  timer = setInterval(() => {
    if (!paused.value) next()
  }, 5000)
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
    class="hero-carousel hidden lg:block absolute right-10 top-1/2 -translate-y-1/2 w-[500px] h-[400px]"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <Transition name="slide-fade">
      <div :key="index" class="absolute inset-0 flex items-center justify-center">
        <div class="relative max-w-full max-h-full rounded-2xl overflow-hidden shadow-card-lg">
          <img
            v-if="imageUrl(slides[index].image_path)"
            :src="imageUrl(slides[index].image_path)!"
            :alt="slides[index].title ?? ''"
            class="block max-w-full max-h-full"
          />
          <div
            v-if="slides[index].title"
            class="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-black/80 to-transparent"
          >
            <div class="font-heading font-bold text-white text-lg leading-tight">
              {{ slides[index].title }}
            </div>
          </div>
          <div
            v-if="slides.length > 1"
            class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10"
          >
            <button
              v-for="(_, i) in slides"
              :key="i"
              type="button"
              :aria-label="`Slide ${i + 1}`"
              class="w-2 h-2 rounded-full transition-all"
              :class="i === index ? 'bg-white w-6' : 'bg-white/40 hover:bg-white/70'"
              @click="go(i)"
            />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.6s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
}
</style>
