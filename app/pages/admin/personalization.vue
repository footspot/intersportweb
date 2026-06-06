<script setup lang="ts">
// * /admin/personalization — admin-only. Groups the storefront customization
// * tools (home carousel, home sections, contact details) under one tabbed page.
definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const tabs = computed(() => [
  { key: 'banner', label: t('admin.sidebar.banner'), icon: 'i-lucide-megaphone' },
  { key: 'carousel', label: t('admin.sidebar.carousel'), icon: 'i-lucide-images' },
  { key: 'entry-cards', label: t('admin.sidebar.entryCards'), icon: 'i-lucide-credit-card' },
  { key: 'home-sections', label: t('admin.sidebar.homeSections'), icon: 'i-lucide-layout-grid' },
  { key: 'contact', label: t('admin.sidebar.contact'), icon: 'i-lucide-mail' },
])

function isValidTab(value: unknown): value is string {
  return typeof value === 'string' && ['banner', 'carousel', 'entry-cards', 'home-sections', 'contact'].includes(value)
}

// * The active tab is mirrored in the `?tab=` query so deep links and the
// * "back to list" link from /admin/home-sections/[id] land on the right tab.
const queryTab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
const activeTab = ref<string>(isValidTab(queryTab) ? queryTab : 'carousel')

watch(activeTab, (key) => {
  router.replace({ query: { ...route.query, tab: key } })
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="font-heading text-2xl font-bold">{{ t('admin.personalization.title') }}</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.personalization.subtitle') }}</p>
    </div>

    <div class="border-b border-gray-200 dark:border-sidebar">
      <nav class="flex gap-1 overflow-x-auto">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          type="button"
          :class="[
            'inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
            activeTab === tab.key
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200',
          ]"
          @click="activeTab = tab.key"
        >
          <UIcon :name="tab.icon" class="w-4 h-4" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>
    </div>

    <!-- * All tabs stay mounted (v-show) so switching keeps state and avoids refetching. -->
    <div v-show="activeTab === 'banner'">
      <AdminPersonalizationBannerManager />
    </div>
    <div v-show="activeTab === 'carousel'">
      <AdminPersonalizationCarouselManager />
    </div>
    <div v-show="activeTab === 'entry-cards'">
      <AdminPersonalizationEntryCardsManager />
    </div>
    <div v-show="activeTab === 'home-sections'">
      <AdminPersonalizationHomeSectionsManager />
    </div>
    <div v-show="activeTab === 'contact'">
      <AdminPersonalizationContactManager />
    </div>
  </div>
</template>
