<script setup lang="ts">
// * Smoke-bomb band — a transparent overlay pulled up over the hero's bottom
// * edge. A canvas particle system blows mixed blue + red smoke in from both
// * screen edges, hugging the band's bottom so it never spills below the hero.
// * Ported from the design prototype (design_handoff_accueil/Smoke Effect.html).
// * Pauses off-screen via IntersectionObserver; static haze under reduced-motion.
const bandEl = ref<HTMLElement | null>(null)
const canvasEl = ref<HTMLCanvasElement | null>(null)

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  decay: number
  size: number
  col: number[]
  phase: number
  amp: number
  freq: number
  idx: number
}

onMounted(() => {
  if (!import.meta.client) return
  const cv = canvasEl.value
  const wrap = bandEl.value
  if (!cv || !wrap) return
  const ctx = cv.getContext('2d')
  if (!ctx) return

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  let W = 0
  let H = 0
  const DPR = Math.min(window.devicePixelRatio || 1, 2)

  function resize() {
    W = wrap!.clientWidth
    H = wrap!.clientHeight
    cv!.width = Math.max(1, W * DPR)
    cv!.height = Math.max(1, H * DPR)
    cv!.style.width = W + 'px'
    cv!.style.height = H + 'px'
    ctx!.setTransform(DPR, 0, 0, DPR, 0, 0)
  }
  resize()
  window.addEventListener('resize', resize)

  let t = 0
  const particles: Particle[] = []
  // * Mixed red + blue streams; yFrac keeps the smoke sitting on the band's lower
  // * half, rising from near its bottom edge.
  const streams = [
    { col: [59, 130, 246], dir: 1, yFrac: 0.76, amp: 40, freq: 0.009, phase: 0 },
    { col: [220, 38, 38], dir: -1, yFrac: 0.9, amp: 40, freq: 0.011, phase: 1.5 },
    { col: [120, 170, 255], dir: 1, yFrac: 0.84, amp: 30, freq: 0.008, phase: 0.8 },
    { col: [255, 90, 90], dir: -1, yFrac: 0.7, amp: 35, freq: 0.01, phase: 2.2 },
    { col: [30, 100, 220], dir: 1, yFrac: 0.66, amp: 25, freq: 0.012, phase: 3.1 },
    { col: [200, 30, 30], dir: -1, yFrac: 0.88, amp: 22, freq: 0.009, phase: 1.0 },
  ]

  function spawn(s: (typeof streams)[number], i: number) {
    const x0 = s.dir === 1 ? -40 : W + 40
    const y0 = s.yFrac * H + (Math.random() - 0.5) * 16
    particles.push({
      x: x0,
      y: y0,
      vx: s.dir * (0.9 + Math.random() * 0.7),
      vy: -(0.05 + Math.random() * 0.28),
      life: 1,
      decay: 0.0035 + Math.random() * 0.002,
      size: 14 + Math.random() * 18,
      col: s.col,
      phase: t + Math.random() * Math.PI * 2,
      amp: s.amp,
      freq: s.freq,
      idx: i,
    })
  }

  function render() {
    ctx!.clearRect(0, 0, W, H)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!
      const a = p.life * 0.42
      const [r, g, b] = p.col as [number, number, number]
      const grd = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size)
      grd.addColorStop(0, `rgba(${r},${g},${b},${a})`)
      grd.addColorStop(0.5, `rgba(${r},${g},${b},${a * 0.5})`)
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx!.beginPath()
      ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx!.fillStyle = grd
      ctx!.fill()
    }
  }

  let running = true
  let raf = 0
  function frame() {
    if (!running) return
    t += 0.016
    streams.forEach((s, i) => {
      const cnt = particles.filter((p) => p.idx === i).length
      if (cnt < 26 && Math.random() < 0.62) spawn(s, i)
    })
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]!
      const wave = Math.sin(p.phase + p.x * p.freq) * p.amp * 0.45
      p.y += p.vy + wave * 0.018
      p.x += p.vx
      p.life -= p.decay
      p.size += 0.15
      if (p.life <= 0 || p.x < -120 || p.x > W + 120) particles.splice(i, 1)
    }
    render()
    raf = requestAnimationFrame(frame)
  }

  let io: IntersectionObserver | null = null
  if (reduce) {
    for (let k = 0; k < 48; k++) {
      const i = k % streams.length
      const s = streams[i]!
      particles.push({
        x: Math.random() * W,
        y: s.yFrac * H + (Math.random() - 0.5) * 30,
        vx: 0,
        vy: 0,
        life: 0.8,
        decay: 0,
        size: 26 + Math.random() * 26,
        col: s.col,
        phase: 0,
        amp: 0,
        freq: 0,
        idx: i,
      })
    }
    render()
  } else {
    io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting && !running) {
            running = true
            raf = requestAnimationFrame(frame)
          } else if (!e.isIntersecting) {
            running = false
          }
        }),
      { threshold: 0 },
    )
    io.observe(wrap)
    raf = requestAnimationFrame(frame)
  }

  onBeforeUnmount(() => {
    running = false
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
    io?.disconnect()
  })
})
</script>

<template>
  <div ref="bandEl" class="smokeband" aria-hidden="true">
    <canvas ref="canvasEl"></canvas>
  </div>
</template>

<style scoped>
.smokeband {
  position: relative;
  z-index: 6;
  height: 174px;
  margin-top: -174px;
  background: transparent;
  overflow: hidden;
  pointer-events: none;
}
.smokeband canvas {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  display: block;
  z-index: 1;
}
@media (max-width: 620px) {
  .smokeband {
    height: 138px;
    margin-top: -138px;
  }
}
</style>
