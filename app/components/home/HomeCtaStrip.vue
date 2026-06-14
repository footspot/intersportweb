<script setup lang="ts">
// * Big closing CTA — red rounded box with a faded "GO" watermark + ring, a
// * headline and a white button that drops the visitor into the shop flow.
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t } = flow

// * Typewriter effect on the headline: it "types itself" the first time the
// * section scrolls into view, with a blinking caret. Full text stays in the
// * h3's aria-label for screen readers / SEO.
const fullTitle = computed(() => t('storefront.home.ctaTitle'))
const typed = ref('')
const caretBlink = ref(false)
const titleEl = ref<HTMLElement | null>(null)
let started = false

function runTypewriter() {
  if (started) return
  started = true

  // * Respect reduced-motion: show the full title at once.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const text = fullTitle.value
  if (reduce) {
    typed.value = text
    caretBlink.value = true
    return
  }

  let i = 0
  const tick = () => {
    typed.value = text.slice(0, i)
    if (i < text.length) {
      i++
      window.setTimeout(tick, 65)
    } else {
      // * Idle caret blinks once typing is complete.
      caretBlink.value = true
    }
  }
  tick()
}

onMounted(() => {
  if (!titleEl.value) return
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        runTypewriter()
        io.disconnect()
      }
    },
    { threshold: 0.45 },
  )
  io.observe(titleEl.value)
})
</script>

<template>
  <section class="cta-strip">
    <div class="cta-box">
      <div class="relative z-[1]">
        <h3 ref="titleEl" class="cta-h font-heading" :aria-label="fullTitle">
          <span aria-hidden="true">{{ typed }}</span><span
            class="cta-caret"
            :class="{ 'is-blink': caretBlink }"
            aria-hidden="true"
          ></span>
        </h3>
        <p class="cta-p">{{ t('storefront.home.ctaText') }}</p>
      </div>
      <button type="button" class="btn-white font-heading" @click="flow.pickEntry('shop')">
        {{ t('storefront.home.ctaButton') }}
        <UIcon name="i-lucide-arrow-right" class="w-[18px] h-[18px]" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.cta-strip {
  max-width: 1260px;
  margin: 0 auto 78px;
  padding: 0 40px;
}
.cta-box {
  background: var(--color-accent);
  border-radius: 26px;
  padding: 54px 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 30px;
  flex-wrap: wrap;
  position: relative;
  overflow: hidden;
}
.cta-box::after {
  content: '';
  position: absolute;
  right: -50px;
  top: -50px;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  border: 64px solid rgba(255, 255, 255, 0.09);
}
.cta-box::before {
  content: 'GO';
  position: absolute;
  left: -10px;
  bottom: -46px;
  font-family: var(--font-heading);
  font-weight: 900;
  font-size: 180px;
  color: rgba(255, 255, 255, 0.1);
  line-height: 1;
}
.cta-h {
  font-weight: 900;
  font-size: clamp(34px, 4.2vw, 52px);
  color: #fff;
  text-transform: uppercase;
  line-height: 0.95;
  /* * Reserve a line so the box doesn't grow as the title types in. */
  min-height: 0.95em;
}
.cta-caret {
  display: inline-block;
  width: 0.5ch;
  height: 0.92em;
  margin-left: 0.08em;
  vertical-align: -0.1em;
  background: #fff;
  border-radius: 1px;
}
/* * Solid while typing; blinks once the title is complete. */
.cta-caret.is-blink {
  animation: cta-blink 1.05s steps(1, end) infinite;
}
@keyframes cta-blink {
  0%,
  50% {
    opacity: 1;
  }
  50.01%,
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cta-caret.is-blink {
    animation: none;
  }
}
.cta-p {
  color: rgba(255, 255, 255, 0.88);
  font-size: 15.5px;
  margin-top: 9px;
  max-width: 440px;
}
.btn-white {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: #fff;
  color: var(--color-accent);
  position: relative;
  z-index: 1;
  font-weight: 800;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 15px 28px;
  border-radius: 12px;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
  transition: transform 0.14s;
}
.btn-white:hover {
  transform: translateY(-2px);
}
@media (max-width: 620px) {
  .cta-box {
    padding: 38px 26px;
  }
  .cta-strip {
    padding: 0 20px;
  }
}
</style>
