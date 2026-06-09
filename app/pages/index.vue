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

await useAsyncData('home-bootstrap', async () => {
  await Promise.all([
    flow.sports.fetchAll(),
    flow.clubs.fetchAll(),
    flow.products.fetchAll(),
    flow.catalog.fetchAll(),
    flow.carousel.fetchAll(),
    flow.homeSections.fetchAll(),
    flow.siteSettings.fetchAll(),
    flow.productDiscounts.fetchAll(),
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
  <div class="home-page bg-page dark:bg-sidebar-bg text-[#1a1a2e] dark:text-gray-100">
    <HomeHero />
    <HomeEntrySection />
    <HomeShopCarousel />

    <HomeCatalogSection />
    <HomeClearanceSection />
    <HomeLinksSection />
    <HomeProductsSection />

    <HomeAbout />

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
