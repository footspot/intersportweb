<script setup lang="ts">
// * Hero background carousel — full-bleed media (images + videos) that fills the
// * whole hero banner, behind the card deck. Images advance after the configured
// * dwell time; videos play to the end then advance. Crossfade between items.
// * A single video loops. Static first item under reduced-motion.
// *
// * Smoothness: all media is preloaded up front (images decoded, videos warmed),
// * playback is driven in JS so the first clip can buffer behind the intro and
// * start instantly, and each item's dwell timer only arms once its first frame
// * has actually painted (@loadeddata / @load) — so loading never shows as a
// * freeze mid-crossfade.
import type { HeroMedia } from '~/stores/heroBanner'

// * `active` gates the carousel: while false (e.g. the launch intro is still
// * playing on top) nothing plays or advances, so the first item doesn't burn
// * through underneath the intro. It starts from the first item when activated.
const props = withDefaults(defineProps<{ items: HeroMedia[]; interval?: number; active?: boolean }>(), {
  interval: 5,
  active: true,
})

const client = useSupabaseClient()
function mediaUrl(path: string): string | null {
  if (!path) return null
  // * Already a usable URL (e.g. an admin preview's not-yet-uploaded blob: file).
  if (/^(blob:|https?:|data:)/.test(path)) return path
  const { data } = client.storage.from('home-carousel').getPublicUrl(path)
  return data?.publicUrl ?? null
}

const index = ref(0)
const reduced = ref(false)
// * The current item's first frame has painted — gates the dwell timer and fade.
const ready = ref(false)
const videoEl = ref<HTMLVideoElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null
// * Detached elements kept alive so the browser caches/decodes media ahead.
let preloaders: HTMLElement[] = []

const current = computed(() => props.items[index.value] ?? null)
const loopSingle = computed(() => props.items.length === 1)

function clearTimer() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}
function next() {
  if (props.items.length <= 1) return
  index.value = (index.value + 1) % props.items.length
}

// * Arm the advance for the current item — only once it has painted. Images use
// * the dwell time (+2s); videos advance on @ended, with a long safety net.
function armTimer() {
  clearTimer()
  if (!ready.value || reduced.value || !props.active) return
  const item = current.value
  if (!item) return
  if (item.media_kind === 'image') {
    timer = setTimeout(next, (Math.max(1, props.interval || 5) + 2) * 1000)
  } else {
    timer = setTimeout(next, 30000)
  }
}

// * Play the current video only while active; pause it otherwise (so it buffers
// * silently behind the intro instead of running concurrently).
function syncVideo() {
  const v = videoEl.value
  if (!v) return
  if (props.active) {
    v.muted = true
    v.play().catch(() => {})
  } else {
    v.pause()
  }
}

// * First frame painted: start playback (if active) and arm the dwell. Idempotent
// * so duplicate load events (or the imperative check below) only fire it once.
function onReady() {
  if (ready.value) return
  ready.value = true
  if (current.value?.media_kind === 'video') syncVideo()
  armTimer()
}

// * Preloaded media is often already cached, so its load event can fire before
// * Vue attaches the listener — leaving the layer stuck invisible. Check the
// * element's own state on (re)mount and mark it ready if the data is in.
function checkReady() {
  if (ready.value) return
  const item = current.value
  if (!item) return
  if (item.media_kind === 'video') {
    if ((videoEl.value?.readyState ?? 0) >= 2) onReady()
  } else if (imgEl.value?.complete && (imgEl.value?.naturalWidth ?? 0) > 0) {
    onReady()
  }
}

// * Warm the cache so each item is decoded/buffered before it's shown.
function preloadAll() {
  if (!import.meta.client) return
  for (const el of preloaders) el.removeAttribute('src')
  preloaders = []
  for (const it of props.items) {
    const url = mediaUrl(it.media_path)
    if (!url) continue
    if (it.media_kind === 'image') {
      const img = new Image()
      img.decoding = 'async'
      img.src = url
      preloaders.push(img)
    } else {
      const v = document.createElement('video')
      v.preload = 'auto'
      v.muted = true
      v.playsInline = true
      v.src = url
      try { v.load() } catch { /* ignore */ }
      preloaders.push(v)
    }
  }
}

onMounted(() => {
  reduced.value = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  preloadAll()
  // * `ready` is driven by the media's own load events (@loadeddata / @load),
  // * with this fallback for already-cached media whose event we'd miss.
  nextTick(checkReady)
})
onBeforeUnmount(clearTimer)

// * New item shown → wait for its first frame before arming/fading.
watch(index, () => {
  ready.value = false
  clearTimer()
  nextTick(checkReady)
})
watch(() => props.items.map((i) => i.id).join(','), () => {
  index.value = 0
  ready.value = false
  clearTimer()
  preloadAll()
  nextTick(checkReady)
})
watch(() => props.interval, armTimer)
// * Start (or resume) from the first item the moment the carousel is activated;
// * pause cleanly when deactivated.
watch(() => props.active, (on) => {
  if (on) {
    syncVideo()
    armTimer()
    nextTick(checkReady)
  } else {
    clearTimer()
    videoEl.value?.pause()
  }
})
</script>

<template>
  <div class="hero-banner absolute inset-0 bg-[#05081a]" aria-hidden="true">
    <Transition name="hb-fade">
      <div :key="index" class="hb-layer absolute inset-0" :class="{ 'hb-shown': ready }">
        <video
          v-if="current && current.media_kind === 'video'"
          ref="videoEl"
          :src="mediaUrl(current.media_path) ?? undefined"
          class="hb-media h-full w-full object-cover"
          muted
          playsinline
          preload="auto"
          :loop="loopSingle"
          @loadeddata="onReady"
          @ended="next"
          @error="next"
        />
        <img
          v-else-if="current"
          ref="imgEl"
          :src="mediaUrl(current.media_path) ?? undefined"
          class="hb-media h-full w-full object-contain"
          decoding="async"
          alt=""
          @load="onReady"
          @error="next"
        />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.hb-layer {
  /* * Hold the layer hidden until its first frame paints, then ease it in —
   * so a slow decode/buffer never flashes a blank or half-loaded frame.
   * Single-class rules below (.hb-shown / .hb-fade-leave-to) so the leaving
   * layer can override the shown state by source order during a crossfade. */
  opacity: 0;
  transition: opacity 0.9s ease;
}
.hb-shown {
  opacity: 1;
}
.hb-media {
  /* * Promote to its own GPU layer for a jank-free crossfade. */
  will-change: opacity, transform;
  transform: translateZ(0);
  backface-visibility: hidden;
}

/* * Crossfade: the leaving layer stays painted on top while the new one fades
 * in, then fades out itself (overrides .hb-shown — defined after it). */
.hb-fade-leave-active {
  position: absolute;
  inset: 0;
  transition: opacity 0.9s ease;
}
.hb-fade-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .hb-layer,
  .hb-fade-leave-active {
    transition: none;
  }
}
</style>
