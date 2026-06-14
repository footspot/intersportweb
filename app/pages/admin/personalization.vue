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
  { key: 'bons-plans', label: t('admin.sidebar.bonsPlans'), icon: 'i-lucide-sparkles' },
  { key: 'contact', label: t('admin.sidebar.contact'), icon: 'i-lucide-mail' },
])

function isValidTab(value: unknown): value is string {
  return typeof value === 'string' && ['banner', 'carousel', 'entry-cards', 'home-sections', 'bons-plans', 'contact'].includes(value)
}

// * The active tab is mirrored in the `?tab=` query so deep links and the
// * "back to list" link from /admin/home-sections/[id] land on the right tab.
const queryTab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
const activeTab = ref<string>(isValidTab(queryTab) ? queryTab : 'carousel')

watch(activeTab, (key) => {
  router.replace({ query: { ...route.query, tab: key } })
})

// * Full-page home preview shown in an overlay (iframe → `/?preview=1`, the
// * read-only render). Re-keyed on each open so the intro/carousel replay fresh.
const showPreview = ref(false)
const previewKey = ref(0)
// * Device frame for the preview iframe — constrains the viewport width so the
// * storefront's responsive layout renders at desktop or phone size.
const previewDevice = ref<'desktop' | 'mobile'>('desktop')
function openPreview() {
  previewKey.value++
  showPreview.value = true
}
function closePreview() {
  showPreview.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') closePreview()
}
watch(showPreview, (open) => {
  if (!import.meta.client) return
  if (open) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  if (import.meta.client) window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.personalization.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.personalization.subtitle') }}</p>
      </div>
      <!-- * Opens the full home page in a read-only overlay (intro, hero banner, carousel…). -->
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-primary text-brand-primary text-sm font-medium hover:bg-brand-primary hover:text-white transition-colors"
        @click="openPreview"
      >
        <UIcon name="i-lucide-eye" class="w-4 h-4" />
        <span>{{ t('admin.personalization.previewHome') }}</span>
      </button>
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
    <div v-show="activeTab === 'bons-plans'">
      <AdminPersonalizationBonsPlansManager />
    </div>
    <div v-show="activeTab === 'contact'">
      <AdminPersonalizationContactManager />
    </div>

    <!-- * Full-page home preview overlay -->
    <ClientOnly>
      <Teleport to="body">
        <Transition name="preview-fade">
          <div
            v-if="showPreview"
            class="fixed inset-0 z-[200] flex flex-col bg-black/80 backdrop-blur-sm"
          >
            <div class="flex items-center justify-between gap-3 px-4 py-2.5 bg-sidebar text-white shrink-0">
              <div class="flex items-center gap-2 text-sm font-medium">
                <UIcon name="i-lucide-eye" class="w-4 h-4" />
                <span>{{ t('admin.personalization.previewHome') }}</span>
              </div>

              <!-- * Device-frame toggle -->
              <div class="flex items-center gap-0.5 rounded-lg bg-white/10 p-0.5">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  :class="previewDevice === 'desktop' ? 'bg-white/20' : 'hover:bg-white/10 text-white/70'"
                  :aria-label="t('admin.personalization.previewDesktop')"
                  @click="previewDevice = 'desktop'"
                >
                  <UIcon name="i-lucide-monitor" class="w-4 h-4" />
                  <span class="hidden sm:inline">{{ t('admin.personalization.previewDesktop') }}</span>
                </button>
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                  :class="previewDevice === 'mobile' ? 'bg-white/20' : 'hover:bg-white/10 text-white/70'"
                  :aria-label="t('admin.personalization.previewMobile')"
                  @click="previewDevice = 'mobile'"
                >
                  <UIcon name="i-lucide-smartphone" class="w-4 h-4" />
                  <span class="hidden sm:inline">{{ t('admin.personalization.previewMobile') }}</span>
                </button>
              </div>

              <button
                type="button"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 transition-colors"
                @click="closePreview"
              >
                <UIcon name="i-lucide-x" class="w-4 h-4" />
                <span>{{ t('common.close') }}</span>
              </button>
            </div>

            <!-- * Centered viewport — phone-framed in mobile mode, full-bleed on desktop. -->
            <div class="flex-1 min-h-0 flex justify-center overflow-hidden" :class="previewDevice === 'mobile' ? 'py-4' : ''">
              <iframe
                :key="`${previewKey}-${previewDevice}`"
                src="/?preview=1"
                class="border-0 bg-white h-full"
                :class="previewDevice === 'mobile'
                  ? 'w-[390px] max-w-full rounded-[26px] shadow-2xl ring-1 ring-white/10'
                  : 'w-full'"
                title="Aperçu de l'accueil"
              />
            </div>
          </div>
        </Transition>
      </Teleport>
    </ClientOnly>
  </div>
</template>

<style scoped>
.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.2s ease;
}
.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}
</style>
