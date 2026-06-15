<script setup lang="ts">
// * Shared search-results body (loading / empty / list / pagination), reused by
// * both the desktop dropdown and the mobile fixed-bottom panel in AppSearch.
import type { useProductSearch } from '~/composables/useProductSearch'

const props = defineProps<{ search: ReturnType<typeof useProductSearch> }>()
const { t, locale } = useI18n()
const client = useSupabaseClient()
const search = props.search

function productName(r: { name: { fr: string; en: string } }) {
  return r.name[locale.value as 'fr' | 'en'] ?? r.name.fr
}
function imageUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}
function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}
</script>

<template>
  <!-- Loading (first load) -->
  <div
    v-if="search.loading.value && !search.results.value.length"
    class="py-8 text-center text-sm text-gray-400"
  >
    <UIcon name="i-lucide-loader-circle" class="w-5 h-5 animate-spin mx-auto" />
  </div>

  <!-- No results -->
  <div
    v-else-if="!search.results.value.length"
    class="py-8 text-center text-sm text-gray-400"
  >
    {{ t('storefront.search.noResults') }}
  </div>

  <template v-else>
    <div class="px-3.5 py-2 text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100 dark:border-sidebar-surface">
      {{ t('storefront.search.results', { n: search.total.value }) }}
    </div>

    <ul class="max-h-[60vh] overflow-y-auto py-1">
      <li v-for="r in search.results.value" :key="r.id">
        <NuxtLink
          :to="`/product/${r.id}`"
          class="flex items-center gap-3 px-3 py-2 no-underline text-inherit hover:bg-gray-50 dark:hover:bg-sidebar-surface transition-colors"
          @click="search.reset()"
        >
          <div class="w-11 h-11 rounded-lg bg-gray-100 dark:bg-sidebar-surface flex items-center justify-center overflow-hidden shrink-0">
            <img v-if="imageUrl(r.image_path)" :src="imageUrl(r.image_path)!" class="w-full h-full object-contain" :alt="productName(r)">
            <UIcon v-else name="i-lucide-image" class="w-5 h-5 text-gray-300" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold text-ink dark:text-gray-100 truncate">{{ productName(r) }}</div>
            <div class="text-[11px] text-gray-400 truncate">
              {{ r.club_name }} · {{ r.reference }}
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-sm font-bold text-ink dark:text-gray-100">{{ fmt(r.unit_price) }}</div>
            <span
              v-if="r.is_on_clearance"
              class="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-accent text-white"
            >
              {{ t('storefront.home.clearance.badge') }}
            </span>
          </div>
        </NuxtLink>
      </li>
    </ul>

    <!-- Pagination -->
    <div
      v-if="search.totalPages.value > 1"
      class="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-sidebar-surface"
    >
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[13px] font-semibold text-ink dark:text-gray-200 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-sidebar-surface disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="search.page.value <= 1"
        @click="search.setPage(search.page.value - 1)"
      >
        <UIcon name="i-lucide-chevron-left" class="w-4 h-4" />
      </button>
      <span class="text-[12px] text-gray-500">
        {{ t('storefront.search.page', { x: search.page.value, n: search.totalPages.value }) }}
      </span>
      <button
        type="button"
        class="inline-flex items-center gap-1 text-[13px] font-semibold text-ink dark:text-gray-200 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-sidebar-surface disabled:opacity-40 disabled:cursor-not-allowed"
        :disabled="!search.hasMore.value"
        @click="search.setPage(search.page.value + 1)"
      >
        <UIcon name="i-lucide-chevron-right" class="w-4 h-4" />
      </button>
    </div>
  </template>
</template>
