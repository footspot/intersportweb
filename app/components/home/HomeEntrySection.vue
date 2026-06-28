<script setup lang="ts">
// * "Comment pouvons-nous vous accompagner ?" — the live entry cards that drive
// * the shop flow (catalog / shop / clearance) plus any admin home-sections.
// * Laid out as a horizontal scroller so any number of admin-added cards stays
// * on one swipeable row instead of wrapping.
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t } = flow

// * Official Intersport blue / red.
const NAVY = '#164194'
const RED = '#e30613'

// * Admin-set cover image + overlay text color for the three static cards.
const s = computed(() => flow.siteSettings.settings)
</script>

<template>
  <section data-home-entry class="px-6 md:px-10 lg:px-12 py-10 bg-white dark:bg-sidebar">
    <div class="flex gap-4 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
      <!-- Catalogues -->
      <HomeEntryCard
        class="shrink-0 w-[280px] sm:w-[300px]"
        :accent="NAVY"
        :title="t('storefront.home.entryCatalogTitle')"
        :desc="t('storefront.home.entryCatalogDesc')"
        :cta="t('nav.catalog')"
        :cover="flow.entryCardCoverUrl(s?.catalog_cover_image_path ?? null)"
        :text-color="s?.catalog_text_color ?? null"
        :gradient="s?.catalog_cover_gradient ?? true"
        @select="flow.pickEntry('catalog')"
      >
        <template #icon>
          <img src="/catalog-logo.png" alt="" class="w-8 h-8 object-contain">
        </template>
      </HomeEntryCard>

      <!-- Boutique Club -->
      <HomeEntryCard
        class="shrink-0 w-[280px] sm:w-[300px]"
        :accent="RED"
        :title="t('storefront.home.entryShopTitle')"
        :desc="t('storefront.home.entryShopDesc')"
        :cta="t('nav.shop')"
        :cover="flow.entryCardCoverUrl(s?.shop_cover_image_path ?? null)"
        :text-color="s?.shop_text_color ?? null"
        :gradient="s?.shop_cover_gradient ?? true"
        @select="flow.pickEntry('shop')"
      >
        <template #icon>
          <img src="/shop-logo.png" alt="" class="w-8 h-8 object-contain">
        </template>
      </HomeEntryCard>

      <!-- Soldes & Déstockage -->
      <HomeEntryCard
        v-if="flow.clearanceVisible.value"
        class="shrink-0 w-[280px] sm:w-[300px]"
        :accent="RED"
        :title="t('storefront.home.clearance.title')"
        :desc="t('storefront.home.clearance.itemsCount', { n: flow.clearanceProducts.value.length })"
        :cta="t('storefront.home.clearance.badge')"
        :cover="flow.entryCardCoverUrl(s?.clearance_cover_image_path ?? null)"
        :text-color="s?.clearance_text_color ?? null"
        :gradient="s?.clearance_cover_gradient ?? true"
        @select="flow.pickEntry('clearance')"
      >
        <template #icon>
          <UIcon name="i-lucide-tag" class="w-8 h-8 text-accent" />
        </template>
      </HomeEntryCard>

      <!-- Admin-managed dynamic sections -->
      <HomeEntryCard
        v-for="section in flow.homeSections.visible"
        :key="section.id"
        class="shrink-0 w-[280px] sm:w-[300px]"
        :accent="section.accent_color"
        :title="section.name"
        :desc="section.description ?? ''"
        :cta="t('nav.catalog')"
        :cover="flow.homeSectionCoverUrl(section.cover_image_path)"
        :text-color="section.text_color"
        :gradient="section.cover_gradient"
        @select="flow.pickHomeSection(section.id)"
      >
        <template #icon>
          <img
            v-if="flow.homeSectionLogoUrl(section.logo_path)"
            :src="flow.homeSectionLogoUrl(section.logo_path)!"
            alt=""
            class="w-8 h-8 object-contain"
          >
          <UIcon v-else name="i-lucide-link" class="w-8 h-8" :style="{ color: section.accent_color }" />
        </template>
      </HomeEntryCard>
    </div>
  </section>
</template>
