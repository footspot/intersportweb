<script setup lang="ts">
// * "Qui sommes-nous ?" band — redesigned navy card: diagonal hairline texture
// * and three value columns (circular-outline icon + heading + paragraph).
const { t } = useI18n()

const cols = computed(() => [
  { icon: 'i-lucide-refresh-cw', title: t('storefront.home.aboutCol1Title'), text: t('storefront.home.aboutCol1Text') },
  { icon: 'i-lucide-headset', title: t('storefront.home.aboutCol2Title'), text: t('storefront.home.aboutCol2Text') },
  { icon: 'i-lucide-crown', title: t('storefront.home.aboutCol3Title'), text: t('storefront.home.aboutCol3Text') },
])
</script>

<template>
  <section class="about">
    <div class="about-card">
      <div class="about-hatch"></div>

      <h2 class="about-title font-heading">{{ t('storefront.home.aboutTitle') }}</h2>

      <div class="about-grid">
        <div v-for="c in cols" :key="c.title" class="acol">
          <div class="ac-ic">
            <UIcon :name="c.icon" class="w-7 h-7 text-white/90" />
          </div>
          <div class="ac-nm">{{ c.title }}</div>
          <p class="ac-tx">{{ c.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.about {
  margin: 78px auto;
  max-width: 1260px;
  padding: 0 40px;
}
.about-card {
  background: #1e51a8;
  border-radius: 26px;
  padding: 64px 56px;
  position: relative;
  overflow: hidden;
}
.dark .about-card {
  background: var(--color-sidebar-surface);
}
.about-hatch {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    -55deg,
    transparent 0 20px,
    rgba(255, 255, 255, 0.035) 20px 22px
  );
}
.about-title {
  position: relative;
  z-index: 1;
  color: #fff;
  font-weight: 900;
  font-size: clamp(36px, 4.6vw, 58px);
  line-height: 0.92;
  letter-spacing: -0.015em;
  text-transform: uppercase;
  margin-bottom: 46px;
}
.about-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 42px;
  position: relative;
  z-index: 1;
}
.ac-ic {
  width: 60px;
  height: 60px;
  border: 1.5px solid rgba(255, 255, 255, 0.32);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 22px;
  transition: border-color 0.25s, background 0.25s;
}
.acol:hover .ac-ic {
  border-color: var(--color-accent);
  background: rgba(255, 255, 255, 0.06);
}
.ac-nm {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 11px;
}
.ac-tx {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.66);
  line-height: 1.65;
}
@media (max-width: 980px) {
  .about-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 620px) {
  .about-grid {
    grid-template-columns: 1fr;
  }
  .about {
    padding: 0 20px;
  }
  .about-card {
    padding: 38px 26px;
  }
}
</style>
