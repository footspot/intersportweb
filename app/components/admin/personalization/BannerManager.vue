<script setup lang="ts">
// * Banner manager — edits the top promo strip (the ink bar above the header).
// * Rendered as the "Banner" tab of /admin/personalization. Customizes the
// * message text and the "En savoir plus" button link; an empty field falls
// * back to the built-in i18n default.
import { useSiteSettingsStore } from '~/stores/siteSettings'

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const siteSettings = useSiteSettingsStore()

const text = ref('')
const url = ref('')
const active = ref(true)
const saving = ref(false)
const saved = ref(false)
const errorMsg = ref<string | null>(null)

onMounted(() => {
  if (!siteSettings.settings) siteSettings.fetchAll()
})

watch(
  () => siteSettings.settings,
  (s) => {
    text.value = s?.promo_banner_text ?? ''
    url.value = s?.promo_banner_url ?? ''
    active.value = s?.promo_banner_active !== false
  },
  { immediate: true },
)

async function save() {
  errorMsg.value = null
  saving.value = true
  saved.value = false
  try {
    await siteSettings.update({
      promo_banner_text: text.value.trim() || null,
      promo_banner_url: url.value.trim() || null,
      promo_banner_active: active.value,
    })
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
      <h2 class="font-heading text-xl font-bold">{{ t('admin.banner.title') }}</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.banner.subtitle') }}</p>
    </div>

    <!-- * Live preview of the strip as it appears above the storefront header. -->
    <div class="bg-ink text-white/85 text-[12px] text-center py-2 px-4 tracking-[0.04em] rounded-lg">
      {{ text.trim() || t('storefront.home.topbarPromo') }} →
      <span class="text-white font-bold underline">{{ t('storefront.home.topbarPromoLink') }}</span>
    </div>

    <form class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-6 space-y-5" @submit.prevent="save">
      <label class="flex items-center gap-3">
        <input v-model="active" type="checkbox" class="w-4 h-4 accent-brand-primary" />
        <span class="text-sm font-medium">{{ t('admin.banner.active') }}</span>
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.banner.text') }}</span>
        <textarea
          v-model="text"
          rows="2"
          :placeholder="t('storefront.home.topbarPromo')"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
        <p class="text-xs text-gray-500 mt-1">{{ t('admin.banner.textHint') }}</p>
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.banner.url') }}</span>
        <input
          v-model="url"
          type="text"
          placeholder="/?step=catalog"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
        <p class="text-xs text-gray-500 mt-1">{{ t('admin.banner.urlHint') }}</p>
      </label>

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
          {{ t('admin.banner.saved') }}
        </span>
      </div>
    </form>
  </div>
</template>
