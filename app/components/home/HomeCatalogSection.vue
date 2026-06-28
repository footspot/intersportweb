<script setup lang="ts">
// * Partner-catalog panel — opens from the "Catalogues" entry card.
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t, locale } = flow
</script>

<template>
  <Transition name="panel">
    <section v-if="flow.mode.value === 'catalog'" data-home-catalog class="px-6 md:px-10 lg:px-12 pb-16 pt-4 bg-page dark:bg-sidebar-bg">
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-ink text-white flex items-center justify-center">
            <UIcon name="i-lucide-book-open" class="w-5 h-5" />
          </div>
          <h2 class="font-heading text-xl md:text-[22px] font-extrabold uppercase tracking-[0.02em] text-ink dark:text-white">
            {{ t('storefront.home.catalogSectionTitle') }}
          </h2>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent px-3.5 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition"
          @click="flow.goHome({ scroll: true })"
        >
          ← {{ t('storefront.home.backToHomeCatalog') }}
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <a
          v-for="link in flow.catalog.sorted"
          :key="link.id"
          :href="link.url"
          target="_blank"
          rel="noopener"
          class="bg-white dark:bg-sidebar-surface border border-gray-200 dark:border-sidebar rounded-2xl p-7 flex items-center gap-4 no-underline text-inherit transition-all hover:-translate-y-1 hover:shadow-card-lg hover:border-accent"
        >
          <div class="w-14 h-14 rounded-[14px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface flex items-center justify-center text-[28px] flex-shrink-0 overflow-hidden">
            <img
              v-if="flow.catalogLogoUrl(link.logo_path)"
              :src="flow.catalogLogoUrl(link.logo_path)!"
              class="w-full h-full object-cover"
              :alt="link.name[locale as 'fr' | 'en'] ?? link.name.fr"
            >
            <UIcon v-else name="i-lucide-book-open" class="w-7 h-7 text-gray-400" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-base font-heading mb-0.5">
              {{ link.name[locale as 'fr' | 'en'] ?? link.name.fr }}
            </div>
            <div class="text-xs text-gray-400 break-all">{{ link.url }}</div>
          </div>
          <span class="text-xl text-gray-400 flex-shrink-0">↗</span>
        </a>
        <div v-if="!flow.catalog.sorted.length" class="col-span-full py-16 text-center text-gray-500">
          {{ t('storefront.home.noCatalog') }}
        </div>
      </div>
    </section>
  </Transition>
</template>
