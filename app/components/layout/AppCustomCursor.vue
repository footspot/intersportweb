<script setup lang="ts">
// * Custom cursor — a lagging ring (lerp) + an instant dot, blended with
// * mix-blend-mode:difference so it reads on any background. Grows over
// * interactive elements and on press. Fine-pointer only; disabled on
// * touch / coarse pointers and under reduced-motion.
const ring = ref<HTMLElement | null>(null)
const dot = ref<HTMLElement | null>(null)
const enabled = ref(false)

const INTERACTIVE = 'a,button,input,select,textarea,label,[role="button"],.pressable,.dcard,.entry-card'

onMounted(() => {
  const fine = window.matchMedia?.('(pointer:fine)').matches
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (!fine || reduced) return
  enabled.value = true

  document.body.classList.add('cursor-on')
  let cx = window.innerWidth / 2
  let cy = window.innerHeight / 2
  let tx = cx
  let ty = cy
  let raf = 0

  const onMove = (e: PointerEvent) => {
    tx = e.clientX
    ty = e.clientY
    if (dot.value) dot.value.style.transform = `translate(${tx}px,${ty}px)`
  }
  const loop = () => {
    cx += (tx - cx) * 0.18
    cy += (ty - cy) * 0.18
    if (ring.value) ring.value.style.transform = `translate(${cx}px,${cy}px)`
    raf = requestAnimationFrame(loop)
  }
  const over = (e: Event) => {
    if ((e.target as HTMLElement)?.closest?.(INTERACTIVE)) ring.value?.classList.add('grow')
  }
  const out = (e: Event) => {
    if ((e.target as HTMLElement)?.closest?.(INTERACTIVE)) ring.value?.classList.remove('grow')
  }
  const down = () => ring.value?.classList.add('grow')
  const up = () => ring.value?.classList.remove('grow')

  window.addEventListener('pointermove', onMove)
  document.addEventListener('pointerover', over)
  document.addEventListener('pointerout', out)
  window.addEventListener('pointerdown', down)
  window.addEventListener('pointerup', up)
  raf = requestAnimationFrame(loop)

  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerover', over)
    document.removeEventListener('pointerout', out)
    window.removeEventListener('pointerdown', down)
    window.removeEventListener('pointerup', up)
    document.body.classList.remove('cursor-on')
  })
})
</script>

<template>
  <div v-if="enabled" aria-hidden="true">
    <div ref="ring" class="cur"></div>
    <div ref="dot" class="cur-dot"></div>
  </div>
</template>

<!-- * Unscoped: the body rule + blend mode must apply globally. -->
<style>
body.cursor-on {
  cursor: none;
}
body.cursor-on a,
body.cursor-on button,
body.cursor-on .pressable,
body.cursor-on input,
body.cursor-on label {
  cursor: none;
}
.cur,
.cur-dot {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 300;
  mix-blend-mode: difference;
  will-change: transform;
}
.cur {
  width: 38px;
  height: 38px;
  margin: -19px 0 0 -19px;
  border: 2px solid #fff;
  border-radius: 50%;
  transition: width 0.2s, height 0.2s, margin 0.2s, opacity 0.2s;
}
.cur.grow {
  width: 70px;
  height: 70px;
  margin: -35px 0 0 -35px;
}
.cur-dot {
  width: 6px;
  height: 6px;
  margin: -3px 0 0 -3px;
  background: #fff;
  border-radius: 50%;
}
@media (hover: none), (pointer: coarse) {
  .cur,
  .cur-dot {
    display: none;
  }
}
</style>
