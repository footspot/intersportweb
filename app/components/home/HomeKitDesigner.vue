<script setup lang="ts">
// * "Personnalise ta tenue" — a launch section for Nike's official team-kit
// * configurator. Nike forbids iframing their tool, so we present a polished,
// * on-brand panel — an animated jersey mockup + feature chips — whose CTA opens
// * the configurator in a new tab.
// *
// * Hover easter-egg: the section reveals the official Nike banner via a "blind"
// * animation — a top half slides down and a bottom half slides up until they
// * meet at the middle — and a Nike button card slides in on the right.
const { t } = useI18n()

// * Official Nike Team Football kit designer (FR).
const DESIGNER_URL = 'https://www.niketeamfootball.com/fr/design'

const features = computed(() => [
  { icon: 'i-lucide-palette', label: t('storefront.home.kitDesigner.feature1') },
  { icon: 'i-lucide-shirt', label: t('storefront.home.kitDesigner.feature2') },
  { icon: 'i-lucide-shield', label: t('storefront.home.kitDesigner.feature3') },
])
</script>

<template>
  <section class="kitd">
    <div class="kitd-stripes" aria-hidden="true"></div>
    <div class="kitd-glow" aria-hidden="true"></div>

    <div class="kitd-in">
      <!-- Copy -->
      <div class="kitd-copy">
        <span class="kitd-kicker">{{ t('storefront.home.kitDesigner.kicker') }}</span>
        <h2 class="kitd-title font-heading">{{ t('storefront.home.kitDesigner.title') }}</h2>
        <p class="kitd-desc">{{ t('storefront.home.kitDesigner.desc') }}</p>

        <ul class="kitd-feats">
          <li v-for="f in features" :key="f.label">
            <span class="kitd-feat-ic"><UIcon :name="f.icon" class="w-[18px] h-[18px]" /></span>
            {{ f.label }}
          </li>
        </ul>

        <a
          :href="DESIGNER_URL"
          target="_blank"
          rel="noopener noreferrer"
          class="kitd-cta font-heading"
        >
          {{ t('storefront.home.kitDesigner.cta') }}
          <UIcon name="i-lucide-arrow-up-right" class="w-[18px] h-[18px]" />
        </a>
        <p class="kitd-note">
          <UIcon name="i-lucide-external-link" class="w-3.5 h-3.5" />
          {{ t('storefront.home.kitDesigner.note') }}
        </p>
      </div>

      <!-- Animated jersey mockup -->
      <div class="kitd-vis" aria-hidden="true">
        <div class="kitd-disc"></div>

        <svg class="kitd-jersey" viewBox="0 0 100 104" role="img">
          <defs>
            <linearGradient id="kitdShine" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28" />
              <stop offset="45%" stop-color="#ffffff" stop-opacity="0" />
            </linearGradient>
          </defs>
          <!-- Jersey body (fill animates through team colours) -->
          <path
            class="kitd-body"
            d="M35,10 L45,10 Q50,16 55,10 L65,10 L90,22 L82,41 L72,35 L72,96 L28,96 L28,35 L18,41 L10,22 Z"
          />
          <!-- Centre stripe -->
          <rect class="kitd-stripe" x="46" y="18" width="8" height="78" />
          <!-- Collar -->
          <path class="kitd-collar" d="M45,10 Q50,16 55,10 L52,21 Q50,24 48,21 Z" />
          <!-- Number -->
          <text class="kitd-num font-heading" x="50" y="78" text-anchor="middle">10</text>
          <!-- Shine overlay -->
          <path
            d="M35,10 L45,10 Q50,16 55,10 L65,10 L90,22 L82,41 L72,35 L72,96 L28,96 L28,35 L18,41 L10,22 Z"
            fill="url(#kitdShine)"
          />
        </svg>

        <!-- Floating colour swatches hinting customization -->
        <span class="kitd-sw sw1"></span>
        <span class="kitd-sw sw2"></span>
        <span class="kitd-sw sw3"></span>
        <span class="kitd-sw sw4"></span>

        <span class="kitd-badge">{{ t('storefront.home.kitDesigner.poweredBy') }}</span>
      </div>
    </div>

    <!-- * Hover reveal: official Nike banner sliding in as two blind halves -->
    <div class="kitd-reveal" aria-hidden="true">
      <img src="/nike-banner-top.jpg" class="kitd-reveal-top" alt="" />
      <img src="/nike-banner-bottom.jpg" class="kitd-reveal-bottom" alt="" />
    </div>

    <!-- * Nike-branded button card, slides in on hover → kit designer -->
    <a
      :href="DESIGNER_URL"
      target="_blank"
      rel="noopener noreferrer"
      class="kitd-nike"
    >
      <img src="/brands-logo/nike-logo.png" alt="Nike" class="kitd-nike-logo" />
      <span class="kitd-nike-cta font-heading">
        {{ t('storefront.home.kitDesigner.nikeVisit') }}
        <UIcon name="i-lucide-arrow-up-right" class="w-[18px] h-[18px]" />
      </span>
    </a>
  </section>
</template>

<style scoped>
.kitd {
  position: relative;
  overflow: hidden;
  background: radial-gradient(120% 130% at 80% -10%, #1e51a8 0%, #0e2a60 45%, #05081a 100%);
  color: #fff;
  margin: 0 auto;
  padding: 0;
}
.kitd-stripes {
  position: absolute;
  inset: -30% -15%;
  z-index: 0;
  opacity: 0.4;
  background: repeating-linear-gradient(-58deg, transparent 0 30px, rgba(255, 255, 255, 0.04) 30px 32px);
}
.kitd-glow {
  position: absolute;
  z-index: 0;
  width: 520px;
  height: 520px;
  right: -120px;
  bottom: -200px;
  background: radial-gradient(circle, var(--color-accent) 0%, transparent 62%);
  opacity: 0.22;
  filter: blur(14px);
  pointer-events: none;
}

.kitd-in {
  position: relative;
  z-index: 1;
  max-width: 1260px;
  margin: 0 auto;
  padding: 64px 40px;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 48px;
  align-items: center;
}

.kitd-kicker {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.62);
  margin-bottom: 16px;
}
.kitd-kicker::before {
  content: '';
  width: 28px;
  height: 2px;
  background: var(--color-accent);
}
.kitd-title {
  font-weight: 900;
  font-size: clamp(34px, 4.4vw, 56px);
  line-height: 0.95;
  letter-spacing: -0.015em;
  text-transform: uppercase;
}
.kitd-desc {
  margin-top: 18px;
  max-width: 480px;
  font-size: 16px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.74);
}
.kitd-feats {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 26px 0 30px;
}
.kitd-feats li {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 13px;
  font-weight: 600;
  padding: 9px 14px;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.07);
  border: 1.5px solid rgba(255, 255, 255, 0.14);
}
.kitd-feat-ic {
  color: var(--color-accent);
  display: inline-flex;
}
.kitd-cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: var(--color-accent);
  color: #fff;
  font-weight: 800;
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 15px 28px;
  border-radius: 12px;
  box-shadow: 0 10px 26px rgba(232, 37, 31, 0.36);
  transition: transform 0.14s, box-shadow 0.22s;
}
.kitd-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 16px 38px rgba(232, 37, 31, 0.5);
}
.kitd-cta :deep(svg) {
  transition: transform 0.2s;
}
.kitd-cta:hover :deep(svg) {
  transform: translate(3px, -3px);
}
.kitd-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

/* ── Jersey mockup ── */
.kitd-vis {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
}
.kitd-disc {
  position: absolute;
  width: 360px;
  height: 360px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.08), transparent 65%);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
}
.kitd-jersey {
  position: relative;
  width: 300px;
  max-width: 78%;
  filter: drop-shadow(0 26px 50px rgba(0, 0, 0, 0.5));
  animation: kitd-bob 5s ease-in-out infinite;
}
.kitd-body {
  fill: #164194;
  stroke: rgba(255, 255, 255, 0.25);
  stroke-width: 0.6;
  animation: kitd-recolor 9s linear infinite;
}
.kitd-stripe {
  fill: rgba(255, 255, 255, 0.16);
}
.kitd-collar {
  fill: rgba(0, 0, 0, 0.25);
}
.kitd-num {
  fill: #fff;
  font-size: 34px;
  font-weight: 900;
  opacity: 0.92;
}
.kitd-sw {
  position: absolute;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
}
.sw1 {
  top: 14%;
  left: 12%;
  background: #e8251f;
  animation: kitd-float 4.2s ease-in-out infinite;
}
.sw2 {
  top: 24%;
  right: 12%;
  background: #16a34a;
  animation: kitd-float 4.8s ease-in-out infinite 0.6s;
}
.sw3 {
  bottom: 20%;
  left: 14%;
  background: #f59e0b;
  animation: kitd-float 5.2s ease-in-out infinite 1.1s;
}
.sw4 {
  bottom: 14%;
  right: 14%;
  background: #ffffff;
  animation: kitd-float 4.5s ease-in-out infinite 0.3s;
}
.kitd-badge {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
}

/* ── Hover reveal: Nike banner as two sliding "blind" halves ── */
.kitd-reveal {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}
.kitd-reveal-top,
.kitd-reveal-bottom {
  position: absolute;
  left: 0;
  width: 100%;
  height: 50%;
  object-fit: cover;
  transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}
/* * Top half hides above, anchored left (keeps the text) + bottom (the seam). */
.kitd-reveal-top {
  top: 0;
  object-position: left bottom;
  transform: translateY(-101%);
}
/* * Bottom half hides below, anchored left (keeps the text) + top (the seam). */
.kitd-reveal-bottom {
  bottom: 0;
  object-position: left top;
  transform: translateY(101%);
}
.kitd:hover .kitd-reveal-top,
.kitd:hover .kitd-reveal-bottom {
  transform: translateY(0);
}

/* ── Nike button card (slides in on hover) ── */
.kitd-nike {
  position: absolute;
  z-index: 3;
  top: 50%;
  right: clamp(24px, 6vw, 96px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  width: 220px;
  background: #fff;
  border-radius: 18px;
  padding: 30px 24px;
  text-decoration: none;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.4);
  opacity: 0;
  transform: translateY(-50%) translateX(0);
  pointer-events: none;
  /* * Exit: just fade out in place — no movement. */
  transition: opacity 0.2s ease, box-shadow 0.22s;
}
.kitd:hover .kitd-nike {
  opacity: 1;
  pointer-events: auto;
  /* * Enter: slide in from the right with a slight delay, after the blinds close. */
  animation: kitd-nike-in 0.32s cubic-bezier(0.16, 1, 0.3, 1) 0.18s both;
}
.kitd-nike:hover {
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.55);
}
.kitd-nike-logo {
  width: 130px;
  height: auto;
}
.kitd-nike-cta {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 800;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #111;
}
.kitd-nike-cta :deep(svg) {
  transition: transform 0.2s;
}
.kitd-nike:hover .kitd-nike-cta :deep(svg) {
  transform: translate(3px, -3px);
}

@keyframes kitd-nike-in {
  from {
    opacity: 0;
    transform: translateY(-50%) translateX(32px);
  }
  to {
    opacity: 1;
    transform: translateY(-50%) translateX(0);
  }
}

@keyframes kitd-bob {
  0%,
  100% {
    transform: translateY(0) rotate(-1deg);
  }
  50% {
    transform: translateY(-12px) rotate(1deg);
  }
}
@keyframes kitd-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}
@keyframes kitd-recolor {
  0%,
  100% {
    fill: #164194;
  }
  25% {
    fill: #e8251f;
  }
  50% {
    fill: #0f9d58;
  }
  75% {
    fill: #f59e0b;
  }
}

@media (max-width: 900px) {
  .kitd-in {
    grid-template-columns: 1fr;
    gap: 8px;
    padding: 48px 24px;
    text-align: center;
  }
  .kitd-kicker,
  .kitd-feats {
    justify-content: center;
  }
  .kitd-desc {
    margin-left: auto;
    margin-right: auto;
  }
  .kitd-vis {
    order: -1;
    min-height: 260px;
  }
}

/* * Touch devices have no hover — keep the original panel and its CTA. */
@media (hover: none) {
  .kitd-reveal,
  .kitd-nike {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .kitd-jersey,
  .kitd-body,
  .kitd-sw {
    animation: none;
  }
  .kitd-reveal-top,
  .kitd-reveal-bottom,
  .kitd-nike {
    transition-duration: 0.001s;
  }
  .kitd:hover .kitd-nike {
    animation-duration: 0.001s;
    animation-delay: 0s;
  }
}
</style>
