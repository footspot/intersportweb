<script setup lang="ts">
// * Carousel manager — home page hero carousel slides.
// * Rendered as the "Carousel" tab of /admin/personalization.
import { useCarouselStore, type HomeSlide } from '~/stores/carousel'
import { useHeroBannerStore, type HeroMedia } from '~/stores/heroBanner'
import { useClubsStore } from '~/stores/clubs'
import { useProductsStore } from '~/stores/products'
import { useSportsStore } from '~/stores/sports'
import { useSiteSettingsStore } from '~/stores/siteSettings'

const { t } = useI18n()
const carousel = useCarouselStore()
const heroBanner = useHeroBannerStore()
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

// * Hero block — show/hide the card deck + the admin launch video.
const showCards = ref(true)
watch(
  () => siteSettings.heroShowCards,
  (v) => {
    showCards.value = v
  },
  { immediate: true },
)
const videoFile = ref<File | null>(null)
const videoFileName = ref('')
const savingHero = ref(false)

const heroVideoUrl = computed(() => siteSettings.heroVideoUrl)

function onVideoPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null
  videoFile.value = f
  videoFileName.value = f?.name ?? ''
}

async function saveHero() {
  savingHero.value = true
  try {
    await siteSettings.updateHero({
      hero_show_cards: showCards.value,
      hero_video: videoFile.value,
    })
    videoFile.value = null
    videoFileName.value = ''
  } finally {
    savingHero.value = false
  }
}

async function removeVideo() {
  savingHero.value = true
  try {
    await siteSettings.updateHero({ clear_hero_video: true })
    videoFile.value = null
    videoFileName.value = ''
  } finally {
    savingHero.value = false
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

// * ── Hero banner: staged editing ──
// * Banner changes (add / reorder / remove) are buffered locally so the admin
// * can review them in the live preview above, then publish them all at once
// * with "Save" — nothing reaches the storefront until then. New files carry a
// * blob: URL in `media_path` for the preview; they're uploaded on save.
interface DraftMedia extends HeroMedia {
  _file?: File
  _new?: boolean
}
const heroDraft = ref<DraftMedia[]>([])
const removedIds = ref<string[]>([])
const heroSaving = ref(false)
let tempCounter = 0

function initHeroDraft() {
  for (const d of heroDraft.value) if (d._new) URL.revokeObjectURL(d.media_path)
  heroDraft.value = heroBanner.sorted.map((m) => ({ ...m }))
  removedIds.value = []
}

// * Dirty when an item was added/removed or the order changed vs. what's live.
const heroDirty = computed(() => {
  if (removedIds.value.length) return true
  if (heroDraft.value.some((d) => d._new)) return true
  const liveIds = heroBanner.sorted.map((m) => m.id)
  const draftIds = heroDraft.value.map((d) => d.id)
  if (liveIds.length !== draftIds.length) return true
  return liveIds.some((id, i) => id !== draftIds[i])
})

onMounted(async () => {
  carousel.fetchAll()
  clubs.fetchAll()
  products.fetchAll()
  sports.fetchAll()
  siteSettings.fetchAll()
  await heroBanner.fetchAll()
  initHeroDraft()
})
onBeforeUnmount(() => {
  for (const d of heroDraft.value) if (d._new) URL.revokeObjectURL(d.media_path)
})

// * Stage a newly picked file (not uploaded yet — happens on save).
function onHeroMediaPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const kind: HeroMedia['media_kind'] = file.type.startsWith('video/') ? 'video' : 'image'
  heroDraft.value.push({
    id: `new-${tempCounter++}`,
    media_kind: kind,
    media_path: URL.createObjectURL(file),
    sort_order: heroDraft.value.length,
    created_at: '',
    _file: file,
    _new: true,
  })
  input.value = ''
}
function moveDraft(i: number, dir: -1 | 1) {
  const j = i + dir
  const arr = heroDraft.value
  if (j < 0 || j >= arr.length) return
  const tmp = arr[i]!
  arr[i] = arr[j]!
  arr[j] = tmp
  arr.forEach((d, k) => (d.sort_order = k))
}
function removeDraft(i: number) {
  const [removed] = heroDraft.value.splice(i, 1)
  if (removed) {
    if (removed._new) URL.revokeObjectURL(removed.media_path)
    else removedIds.value.push(removed.id)
  }
  heroDraft.value.forEach((d, k) => (d.sort_order = k))
}

// * Publish the staged banner: delete, upload new, then persist the final order.
async function saveBanner() {
  heroSaving.value = true
  try {
    for (const id of removedIds.value) await heroBanner.remove(id)
    const idMap = new Map<string, string>()
    for (const d of heroDraft.value) {
      if (d._new && d._file) {
        const created = await heroBanner.create(d._file, d.media_kind)
        if (created) idMap.set(d.id, created.id)
      }
    }
    for (let i = 0; i < heroDraft.value.length; i++) {
      const d = heroDraft.value[i]!
      const realId = d._new ? idMap.get(d.id) : d.id
      if (realId) await heroBanner.update({ id: realId, sort_order: i })
    }
    await heroBanner.fetchAll()
    initHeroDraft()
  } finally {
    heroSaving.value = false
  }
}
function discardBanner() {
  initHeroDraft()
}

// * Resolve a draft item's thumbnail — blob: URL for new files, storage path otherwise.
function draftMediaUrl(path: string | null) {
  if (!path) return null
  if (/^(blob:|https?:|data:)/.test(path)) return path
  const { data } = client.storage.from('home-carousel').getPublicUrl(path)
  return data?.publicUrl ?? null
}

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
      :banner-items="heroDraft"
      :show-cards="showCards"
      :stats-clubs="previewStats.clubs"
      :stats-products="previewStats.products"
      :stats-sports="previewStats.sports"
      :interval="autoplaySeconds"
    />

    <!-- * Hero block — launch video + card-deck visibility. -->
    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4 space-y-4">
      <label class="flex items-start gap-3 cursor-pointer">
        <input v-model="showCards" type="checkbox" class="mt-0.5 w-4 h-4 accent-brand-primary" />
        <span>
          <span class="text-sm font-medium block">{{ t('admin.carousel.showCardsLabel') }}</span>
          <span class="text-xs text-gray-500">{{ t('admin.carousel.showCardsHint') }}</span>
        </span>
      </label>

      <div class="border-t border-gray-100 dark:border-sidebar pt-4">
        <span class="text-sm font-medium">{{ t('admin.carousel.heroVideoLabel') }}</span>
        <p class="text-xs text-gray-500 mt-0.5 mb-2">{{ t('admin.carousel.heroVideoHint') }}</p>

        <div class="flex flex-wrap items-center gap-3">
          <video
            v-if="heroVideoUrl"
            :src="heroVideoUrl"
            muted
            playsinline
            class="w-32 h-20 rounded-lg object-cover bg-black"
          />
          <div v-else class="w-32 h-20 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center text-gray-400">
            <UIcon name="i-lucide-video-off" class="w-6 h-6" />
          </div>

          <div class="flex-1 min-w-[180px]">
            <p class="text-xs mb-2" :class="heroVideoUrl ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400'">
              {{ videoFileName || (heroVideoUrl ? t('admin.carousel.heroVideoCurrent') : t('admin.carousel.heroVideoNone')) }}
            </p>
            <label class="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar text-sm font-medium cursor-pointer hover:border-brand-primary/50">
              <UIcon name="i-lucide-upload" class="w-4 h-4" />
              {{ t('admin.carousel.heroVideoChoose') }}
              <input type="file" accept="video/mp4,video/webm" class="hidden" @change="onVideoPick" />
            </label>
            <button
              v-if="heroVideoUrl"
              type="button"
              class="ml-2 px-3 py-2 rounded-lg text-sm font-medium text-brand-secondary hover:bg-brand-secondary/10 disabled:opacity-60"
              :disabled="savingHero"
              @click="removeVideo"
            >
              {{ t('admin.carousel.heroVideoRemove') }}
            </button>
          </div>
        </div>
      </div>

      <div class="flex justify-end">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
          :disabled="savingHero"
          @click="saveHero"
        >
          {{ savingHero ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </div>

    <!-- * Full-bleed banner media (images + videos), behind the cards. Staged:
         changes only go live when published, so they can be previewed first. -->
    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4 space-y-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="font-medium">{{ t('admin.carousel.bannerTitle') }}</h3>
          <p class="text-xs text-gray-500">{{ t('admin.carousel.bannerSubtitle') }}</p>
        </div>
        <label class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium cursor-pointer hover:bg-brand-primary-dark">
          <UIcon name="i-lucide-plus" class="w-4 h-4" />
          {{ t('admin.carousel.bannerAdd') }}
          <input type="file" accept="image/*,video/*" class="hidden" @change="onHeroMediaPick" />
        </label>
      </div>

      <div v-if="!heroDraft.length" class="text-sm text-gray-500 text-center py-6">
        {{ t('admin.carousel.bannerEmpty') }}
      </div>
      <ul v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <li
          v-for="(m, i) in heroDraft"
          :key="m.id"
          class="relative rounded-lg overflow-hidden border border-gray-200 dark:border-sidebar group"
        >
          <video
            v-if="m.media_kind === 'video'"
            :src="draftMediaUrl(m.media_path) ?? undefined"
            muted
            playsinline
            class="w-full h-24 object-cover bg-black"
          />
          <img v-else :src="draftMediaUrl(m.media_path) ?? undefined" class="w-full h-24 object-cover" alt="" />
          <span class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-semibold uppercase tracking-wide">
            {{ m.media_kind === 'video' ? t('admin.carousel.kindVideo') : t('admin.carousel.kinds.image') }}
          </span>
          <span v-if="m._new" class="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-brand-primary text-white text-[10px] font-semibold uppercase tracking-wide">
            {{ t('admin.carousel.bannerNew') }}
          </span>
          <div class="absolute inset-x-0 bottom-0 flex items-center justify-between px-1.5 py-1 bg-black/55 opacity-0 group-hover:opacity-100 transition">
            <button type="button" class="p-1 text-white disabled:opacity-30" :disabled="i === 0" :aria-label="t('admin.carousel.moveUp')" @click="moveDraft(i, -1)">
              <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
            </button>
            <button type="button" class="p-1 text-white disabled:opacity-30" :disabled="i === heroDraft.length - 1" :aria-label="t('admin.carousel.moveDown')" @click="moveDraft(i, 1)">
              <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
            </button>
            <button type="button" class="p-1 text-white" :aria-label="t('common.delete')" @click="removeDraft(i)">
              <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
            </button>
          </div>
        </li>
      </ul>

      <!-- * Publish / discard the staged banner. -->
      <div class="flex items-center justify-end gap-3 border-t border-gray-100 dark:border-sidebar pt-3">
        <span v-if="heroDirty" class="mr-auto text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5">
          <UIcon name="i-lucide-circle-alert" class="w-4 h-4" />
          {{ t('admin.carousel.bannerUnsaved') }}
        </span>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-sidebar disabled:opacity-40"
          :disabled="!heroDirty || heroSaving"
          @click="discardBanner"
        >
          {{ t('admin.carousel.bannerDiscard') }}
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-50"
          :disabled="!heroDirty || heroSaving"
          @click="saveBanner"
        >
          {{ heroSaving ? t('common.loading') : t('admin.carousel.bannerSave') }}
        </button>
      </div>
    </div>

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
