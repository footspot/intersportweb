<script setup lang="ts">
// * Entry-cards manager — sets a full-card cover image + overlay text color for
// * the three static home cards (Catalogue / Boutique / Soldes). With no cover
// * image a card keeps its default accent color + white background. A live
// * preview mirrors the storefront card before saving.
import { useSiteSettingsStore, type EntryCardInput } from '~/stores/siteSettings'

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const siteSettings = useSiteSettingsStore()
const client = useSupabaseClient()

// * Official Intersport blue / red — same accents the storefront cards use.
const NAVY = '#164194'
const RED = '#e30613'

type CardKey = 'catalog' | 'shop' | 'clearance'
// * Representative text per card so the preview matches the live storefront.
const CARDS: { key: CardKey; label: string; accent: string; title: string; desc: string; cta: string }[] = [
  { key: 'catalog', label: t('admin.entryCards.catalog'), accent: NAVY, title: t('storefront.home.entryCatalogTitle'), desc: t('storefront.home.entryCatalogDesc'), cta: t('nav.catalog') },
  { key: 'shop', label: t('admin.entryCards.shop'), accent: RED, title: t('storefront.home.entryShopTitle'), desc: t('storefront.home.entryShopDesc'), cta: t('nav.shop') },
  { key: 'clearance', label: t('admin.entryCards.clearance'), accent: RED, title: t('storefront.home.clearance.title'), desc: t('storefront.home.clearance.badge'), cta: t('storefront.home.clearance.badge') },
]

interface CardState {
  path: string | null
  file: File | null
  color: string
  gradient: boolean
  objectUrl: string | null
}
function blank(): CardState {
  return { path: null, file: null, color: '#ffffff', gradient: true, objectUrl: null }
}
const state = reactive<Record<CardKey, CardState>>({
  catalog: blank(),
  shop: blank(),
  clearance: blank(),
})

const saving = ref(false)
const saved = ref(false)
const errorMsg = ref<string | null>(null)

onMounted(() => {
  if (!siteSettings.settings) siteSettings.fetchAll()
})

watch(
  () => siteSettings.settings,
  (s) => {
    for (const { key } of CARDS) {
      const gradient = (s?.[`${key}_cover_gradient`] as boolean | undefined) ?? true
      state[key].path = (s?.[`${key}_cover_image_path`] as string | null) ?? null
      state[key].gradient = gradient
      // * Default follows the gradient (white over it, black on a bare image).
      state[key].color = (s?.[`${key}_text_color`] as string | null) ?? (gradient ? '#ffffff' : '#000000')
      state[key].file = null
    }
  },
  { immediate: true },
)

// * Manage object URLs for newly-picked files (revoked on change/unmount).
for (const { key } of CARDS) {
  watch(
    () => state[key].file,
    (f) => {
      if (state[key].objectUrl) URL.revokeObjectURL(state[key].objectUrl)
      state[key].objectUrl = f ? URL.createObjectURL(f) : null
    },
  )
}
onBeforeUnmount(() => {
  for (const { key } of CARDS) if (state[key].objectUrl) URL.revokeObjectURL(state[key].objectUrl)
})

function previewUrl(key: CardKey): string | null {
  if (state[key].objectUrl) return state[key].objectUrl
  if (state[key].path) {
    return client.storage.from('entry-card-covers').getPublicUrl(state[key].path).data?.publicUrl ?? null
  }
  return null
}

async function save() {
  errorMsg.value = null
  saving.value = true
  saved.value = false
  try {
    const payload: EntryCardInput = {}
    for (const { key } of CARDS) {
      payload[`${key}_text_color`] = state[key].color.trim()
      payload[`${key}_cover_gradient`] = state[key].gradient
      payload[`${key}_cover`] = state[key].file
      // * Cover was present before but is now gone (no file, no path) → clear it.
      const had = !!(siteSettings.settings?.[`${key}_cover_image_path`])
      payload[`clear_${key}_cover`] = !state[key].file && !state[key].path && had
    }
    await siteSettings.updateEntryCards(payload)
    saved.value = true
    setTimeout(() => (saved.value = false), 3000)
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <div>
      <h2 class="font-heading text-xl font-bold">{{ t('admin.entryCards.title') }}</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.entryCards.subtitle') }}</p>
    </div>

    <form class="space-y-4" @submit.prevent="save">
      <div
        v-for="card in CARDS"
        :key="card.key"
        class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-6"
      >
        <h3 class="font-heading font-bold mb-4">{{ card.label }}</h3>

        <div class="grid gap-5 sm:grid-cols-2">
          <!-- * Controls -->
          <div class="space-y-4">
            <div>
              <AdminImageUploader
                v-model:path="state[card.key].path"
                v-model:file="state[card.key].file"
                bucket="entry-card-covers"
                :label="t('admin.entryCards.cover')"
              />
              <p class="text-xs text-gray-500 mt-1.5">{{ t('admin.entryCards.coverHint') }}</p>
            </div>

            <template v-if="state[card.key].path || state[card.key].file">
              <label class="flex items-center gap-3 select-none cursor-pointer">
                <input
                  v-model="state[card.key].gradient"
                  type="checkbox"
                  class="w-4 h-4 rounded border-gray-300 dark:border-sidebar text-brand-primary focus:ring-brand-primary"
                  @change="state[card.key].color = ($event.target as HTMLInputElement).checked ? '#ffffff' : '#000000'"
                />
                <span class="text-sm font-medium">{{ t('admin.entryCards.gradient') }}</span>
              </label>

              <label class="block">
                <span class="text-sm font-medium">{{ t('admin.entryCards.textColor') }}</span>
                <div class="mt-1 flex items-center gap-2">
                  <input
                    :value="state[card.key].color || '#000000'"
                    type="color"
                    class="w-12 h-10 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent cursor-pointer"
                    @input="state[card.key].color = ($event.target as HTMLInputElement).value"
                  />
                  <input
                    v-model="state[card.key].color"
                    type="text"
                    placeholder="#ffffff"
                    class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none font-mono text-sm"
                  />
                </div>
              </label>
            </template>
          </div>

          <!-- * Live preview -->
          <div>
            <p class="text-sm font-medium mb-2">{{ t('admin.entryCards.preview') }}</p>
            <HomeEntryCard
              v-if="previewUrl(card.key)"
              class="w-full max-w-[300px]"
              :accent="card.accent"
              :title="card.title"
              :desc="card.desc"
              :cta="card.cta"
              :cover="previewUrl(card.key)"
              :text-color="state[card.key].color || null"
              :gradient="state[card.key].gradient"
            />
            <p v-else class="text-xs text-gray-400 italic">{{ t('admin.entryCards.previewEmpty') }}</p>
          </div>
        </div>
      </div>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <div class="flex items-center gap-3">
        <button
          type="submit"
          :disabled="saving"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
        >
          <UIcon v-if="saving" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          {{ t('common.save') }}
        </button>
        <span v-if="saved" class="text-sm text-brand-green inline-flex items-center gap-1">
          <UIcon name="i-lucide-check-circle-2" class="w-4 h-4" />
          {{ t('admin.entryCards.saved') }}
        </span>
      </div>
    </form>
  </div>
</template>
