<script setup lang="ts">
// * Storefront home — Intersport-branded layout (see intersport_accueil.html):
// * navy hero + auto-zooming carousel → support cards → live shop flow
// * (sports → clubs → products) / catalog / clearance / link panels →
// * "Qui sommes-nous" band → latest Instagram post.
// *
// * The interactive state machine lives in `useHomeFlow()`; it is created here
// * once and shared with the split section components via provide/inject.
import { useHomeFlow, HomeFlowKey } from '~/composables/useHomeFlow'
import { useInstagramStore } from '~/stores/instagram'

const flow = useHomeFlow()
provide(HomeFlowKey, flow)

const instagram = useInstagramStore()

// * Admin preview mode (`/?preview`): renders the full home exactly as a visitor
// * first sees it (intro video → hero banner → carousel → marquee → …) but fully
// * non-interactive, so admins can review the render from /admin/personalization.
const route = useRoute()
const isPreview = computed(() => route.query.preview !== undefined)

await useAsyncData('home-bootstrap', async () => {
  await Promise.all([
    flow.sports.fetchAll(),
    flow.clubs.fetchAll(),
    flow.products.fetchAll(),
    flow.catalog.fetchAll(),
    flow.carousel.fetchAll(),
    flow.heroBanner.fetchAll(),
    flow.homeSections.fetchAll(),
    flow.siteSettings.fetchAll(),
    flow.productDiscounts.fetchAll(),
    flow.featuredProducts.fetchAll(),
    instagram.fetchAll(),
  ])
  return true
})

// * SEO — homepage meta + Organization JSON-LD (logo, name, contact surface).
const siteUrl = useRuntimeConfig().public.siteUrl || 'https://www.intersportclubidf.com'
const homeDescription =
  'Boutique en ligne Intersport Club IDF : maillots, textiles et équipements personnalisés pour les clubs sportifs d\'Île-de-France. Livraison Colissimo ou retrait club.'

useSeoMeta({
  title: 'Intersport Club IDF — Équipements personnalisés pour clubs sportifs',
  description: homeDescription,
  ogTitle: 'Intersport Club IDF',
  ogDescription: homeDescription,
  ogImage: `${siteUrl}/shop-logo.png`,
  ogType: 'website',
  twitterCard: 'summary_large_image',
})

useSchemaOrg([
  defineOrganization({
    name: 'Intersport Club IDF',
    logo: `${siteUrl}/logo_compose.svg`,
    description: homeDescription,
  }),
  defineWebSite({ name: 'Intersport Club IDF' }),
])
</script>

<template>
  <div
    class="home-page bg-page dark:bg-sidebar-bg text-[#1a1a2e] dark:text-gray-100"
    :class="{ 'home-preview': isPreview }"
  >
    <!-- * Read-only badge while in admin preview mode -->
    <div v-if="isPreview" class="preview-badge">
      <UIcon name="i-lucide-eye" class="w-4 h-4" />
      {{ flow.t('storefront.home.previewBadge') }}
    </div>

    <HomeHero />
    <!-- * Smoke band pulls itself up over the hero's bottom edge (negative margin) -->
    <HomeSmokeBand />

    <HomeEntrySection />
    <HomeShopCarousel />

    <HomeCatalogSection />
    <HomeClearanceSection />
    <HomeLinksSection />
    <HomeProductsSection />

    <!-- * Below the products: new design — partner marquee → bons plans → about → big CTA -->
    <HomeBrandMarquee />
    <HomeBonsPlans />

    <!-- * Nike Team kit configurator launcher (Nike forbids iframing → opens in a new tab) -->
    <HomeKitDesigner />

    <HomeAbout />
    <HomeCtaStrip />

    <!-- * Latest official Instagram post — renders only when the worker cached one -->
    <HomeInstagramLatest />

    <HomeClubPasswordModal
      v-model="flow.pwOpen.value"
      :club="flow.pendingClub.value"
      @unlocked="flow.onPwUnlocked()"
      @cancel="flow.pendingClub.value = null"
    />
  </div>
</template>

<style scoped>
/* * Preview mode — block every interaction so the render can be reviewed safely. */
.home-preview {
  pointer-events: none;
  user-select: none;
}
.preview-badge {
  position: fixed;
  z-index: 60;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: #fff;
  background: rgba(3, 49, 249, 0.92);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(4px);
}
</style>
