<script setup lang="ts">
// * "Qui sommes-nous ?" band — three value columns, mockup ink-mid background.
const { t } = useI18n()

const cols = computed(() => [
  { icon: 'i-lucide-refresh-cw', title: t('storefront.home.aboutCol1Title'), text: t('storefront.home.aboutCol1Text') },
  { icon: 'i-lucide-headset', title: t('storefront.home.aboutCol2Title'), text: t('storefront.home.aboutCol2Text') },
  { icon: 'i-lucide-crown', title: t('storefront.home.aboutCol3Title'), text: t('storefront.home.aboutCol3Text') },
])
</script>

<template>
  <section class="px-6 md:px-10 lg:px-12 pb-14 bg-page dark:bg-sidebar-bg">
    <div class="about-band relative overflow-hidden bg-ink dark:bg-sidebar-surface rounded-xl px-8 py-12 md:px-14">
      <div class="about-hatch absolute inset-0 pointer-events-none"></div>

      <div class="flex items-center gap-3.5 mb-10 relative z-[1]">
        <h2 class="font-heading text-2xl md:text-[28px] font-bold text-white">
          {{ t('storefront.home.aboutTitle') }}
        </h2>
        <UIcon name="i-lucide-shield-check" class="w-7 h-7 text-white/80" />
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-10 relative z-[1]">
        <div v-for="c in cols" :key="c.title">
          <div class="w-14 h-14 rounded-full border-[1.5px] border-white/35 flex items-center justify-center mb-5">
            <UIcon :name="c.icon" class="w-6 h-6 text-white/90" />
          </div>
          <div class="font-heading font-bold text-[17px] text-white mb-3">{{ c.title }}</div>
          <p class="text-sm text-white/65 leading-[1.65]">{{ c.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.about-hatch {
  background: repeating-linear-gradient(
    -55deg,
    transparent,
    transparent 18px,
    rgba(255, 255, 255, 0.03) 18px,
    rgba(255, 255, 255, 0.03) 20px
  );
}
</style>
