<script setup lang="ts">
// * Carousel manager — home page hero carousel slides.
// * Rendered as the "Carousel" tab of /admin/personalization.
import { useCarouselStore, type HomeSlide } from '~/stores/carousel'
import { useClubsStore } from '~/stores/clubs'
import { useProductsStore } from '~/stores/products'
import { useSportsStore } from '~/stores/sports'
import { useSiteSettingsStore } from '~/stores/siteSettings'

const { t } = useI18n()
const carousel = useCarouselStore()
const clubs = useClubsStore()
const products = useProductsStore()
const sports = useSportsStore()
const siteSettings = useSiteSettingsStore()
const client = useSupabaseClient()

// * Autoplay dwell time (seconds per slide), saved on the singleton site_settings row.
const autoplaySeconds = ref(3)
const savingInterval = ref(false)
watch(
  () => siteSettings.carouselAutoplaySeconds,
  (v) => {
    autoplaySeconds.value = v
  },
  { immediate: true },
)

async function saveInterval() {
  savingInterval.value = true
  try {
    const n = Math.min(60, Math.max(1, Math.round(Number(autoplaySeconds.value) || 3)))
    autoplaySeconds.value = n
    await siteSettings.update({ carousel_autoplay_seconds: n })
  } finally {
    savingInterval.value = false
  }
}

// * Stats shown in the hero preview — match the live computation in pages/index.vue.
const previewStats = computed(() => ({
  clubs: clubs.items.length,
  products: products.items.filter((p) => p.is_visible).length,
  sports: sports.items.length,
}))

const showForm = ref(false)
const editing = ref<HomeSlide | null>(null)

const confirmOpen = ref(false)
const deleting = ref<HomeSlide | null>(null)
const confirmBusy = ref(false)

onMounted(() => {
  carousel.fetchAll()
  clubs.fetchAll()
  products.fetchAll()
  sports.fetchAll()
  siteSettings.fetchAll()
})

function imageUrl(path: string | null) {
  if (!path) return null
  const { data } = client.storage.from('home-carousel').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function openCreate() {
  editing.value = null
  showForm.value = true
}
function openEdit(slide: HomeSlide) {
  editing.value = slide
  showForm.value = true
}
function askDelete(slide: HomeSlide) {
  deleting.value = slide
  confirmOpen.value = true
}
async function doDelete() {
  if (!deleting.value) return
  confirmBusy.value = true
  try {
    await carousel.remove(deleting.value.id)
    confirmOpen.value = false
    deleting.value = null
  } finally {
    confirmBusy.value = false
  }
}

async function moveUp(slide: HomeSlide, index: number) {
  if (index === 0) return
  const above = carousel.sorted[index - 1]
  await Promise.all([
    carousel.update({ id: slide.id, sort_order: above.sort_order }),
    carousel.update({ id: above.id, sort_order: slide.sort_order }),
  ])
}
async function moveDown(slide: HomeSlide, index: number) {
  if (index >= carousel.sorted.length - 1) return
  const below = carousel.sorted[index + 1]
  await Promise.all([
    carousel.update({ id: slide.id, sort_order: below.sort_order }),
    carousel.update({ id: below.id, sort_order: slide.sort_order }),
  ])
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="font-heading text-xl font-bold">{{ t('admin.carousel.title') }}</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.carousel.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
        @click="openCreate"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        <span>{{ t('admin.carousel.new') }}</span>
      </button>
    </div>

    <AdminCarouselHeroPreview
      :slides="carousel.sorted"
      :stats-clubs="previewStats.clubs"
      :stats-products="previewStats.products"
      :stats-sports="previewStats.sports"
      :interval="autoplaySeconds"
    />

    <!-- * Autoplay dwell time — global carousel setting. -->
    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4 flex flex-wrap items-end gap-4">
      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.carousel.autoplayLabel') }}</span>
        <div class="mt-1 flex items-center gap-2">
          <input
            v-model.number="autoplaySeconds"
            type="number"
            min="1"
            max="60"
            class="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
          <span class="text-sm text-gray-500">{{ t('admin.carousel.autoplayUnit') }}</span>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('admin.carousel.autoplayHint') }}</p>
      </label>
      <button
        type="button"
        class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
        :disabled="savingInterval"
        @click="saveInterval"
      >
        {{ savingInterval ? t('common.loading') : t('common.save') }}
      </button>
    </div>

    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="carousel.loading" class="p-10 text-center text-gray-500">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="carousel.sorted.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-images" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.carousel.empty') }}</p>
      </div>
      <ul v-else class="divide-y divide-gray-100 dark:divide-sidebar">
        <li
          v-for="(slide, i) in carousel.sorted"
          :key="slide.id"
          class="flex items-center gap-4 p-4"
        >
          <span class="text-xs font-mono text-gray-400 w-6 text-center">{{ i + 1 }}</span>
          <div class="w-24 h-16 rounded-lg bg-gray-100 dark:bg-sidebar overflow-hidden flex items-center justify-center shrink-0">
            <img v-if="imageUrl(slide.image_path)" :src="imageUrl(slide.image_path)!" class="w-full h-full object-cover" alt="" />
            <UIcon v-else name="i-lucide-image" class="w-5 h-5 text-gray-400" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate">{{ slide.title || t('admin.carousel.noTitle') }}</div>
            <div class="text-xs text-gray-500">{{ t('admin.carousel.position') }} #{{ slide.sort_order }}</div>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar disabled:opacity-30"
              :disabled="i === 0"
              :aria-label="t('admin.carousel.moveUp')"
              @click="moveUp(slide, i)"
            >
              <UIcon name="i-lucide-arrow-up" class="w-4 h-4" />
            </button>
            <button
              type="button"
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar disabled:opacity-30"
              :disabled="i === carousel.sorted.length - 1"
              :aria-label="t('admin.carousel.moveDown')"
              @click="moveDown(slide, i)"
            >
              <UIcon name="i-lucide-arrow-down" class="w-4 h-4" />
            </button>
            <button
              type="button"
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
              :aria-label="t('common.edit')"
              @click="openEdit(slide)"
            >
              <UIcon name="i-lucide-pencil" class="w-4 h-4" />
            </button>
            <button
              type="button"
              class="p-2 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary"
              :aria-label="t('common.delete')"
              @click="askDelete(slide)"
            >
              <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
            </button>
          </div>
        </li>
      </ul>
    </div>

    <AdminCarouselSlideFormModal
      v-model="showForm"
      :slide="editing"
      @saved="carousel.fetchAll()"
    />
    <AdminConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.carousel.deleteTitle')"
      :message="t('admin.carousel.deleteConfirm')"
      :busy="confirmBusy"
      @confirm="doDelete"
    />
  </div>
</template>
