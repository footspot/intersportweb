<script setup lang="ts">
// * Admin-managed home-section panel — a grid of external links.
import { useHomeFlowCtx } from '~/composables/useHomeFlow'

const flow = useHomeFlowCtx()
const { t } = flow
</script>

<template>
  <Transition name="panel">
    <section
      v-if="flow.mode.value === 'home-section' && flow.selectedHomeSection.value"
      data-home-section
      class="px-6 md:px-10 lg:px-12 pb-16 pt-4 bg-page dark:bg-sidebar-bg"
    >
      <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
            :style="{ backgroundColor: flow.selectedHomeSection.value.accent_color + '1a' }"
          >
            <img
              v-if="flow.homeSectionLogoUrl(flow.selectedHomeSection.value.logo_path)"
              :src="flow.homeSectionLogoUrl(flow.selectedHomeSection.value.logo_path)!"
              class="w-full h-full object-cover"
              alt=""
            >
            <UIcon
              v-else
              name="i-lucide-link"
              class="w-5 h-5"
              :style="{ color: flow.selectedHomeSection.value.accent_color }"
            />
          </div>
          <h2 class="font-heading text-xl md:text-[22px] font-extrabold uppercase tracking-[0.02em] truncate text-ink dark:text-white">
            {{ flow.selectedHomeSection.value.name }}
          </h2>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-[13px] font-semibold px-3.5 py-1.5 rounded-lg transition"
          :style="{
            color: flow.selectedHomeSection.value.accent_color,
            backgroundColor: flow.selectedHomeSection.value.accent_color + '1a',
          }"
          @click="flow.goHome()"
        >
          ← {{ t('storefront.home.backToHomeCatalog') }}
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <a
          v-for="link in flow.selectedHomeSectionLinks.value"
          :key="link.id"
          :href="link.url"
          target="_blank"
          rel="noopener"
          class="bg-white dark:bg-sidebar-surface border border-gray-200 dark:border-sidebar rounded-2xl p-7 flex items-center gap-4 no-underline text-inherit transition-all hover:-translate-y-1 hover:shadow-card-lg hover:border-accent"
        >
          <div class="w-14 h-14 rounded-[14px] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface flex items-center justify-center text-[28px] flex-shrink-0 overflow-hidden">
            <img
              v-if="flow.homeSectionLinkLogoUrl(link.logo_path)"
              :src="flow.homeSectionLinkLogoUrl(link.logo_path)!"
              class="w-full h-full object-cover"
              :alt="link.name"
            >
            <UIcon v-else name="i-lucide-link" class="w-7 h-7 text-gray-400" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-base font-heading mb-0.5">{{ link.name }}</div>
            <div class="text-xs text-gray-400 break-all">{{ link.url }}</div>
          </div>
          <span class="text-xl text-gray-400 flex-shrink-0">↗</span>
        </a>
        <div v-if="!flow.selectedHomeSectionLinks.value.length" class="col-span-full py-16 text-center text-gray-500">
          {{ t('storefront.home.homeSection.empty') }}
        </div>
      </div>
    </section>
  </Transition>
</template>
