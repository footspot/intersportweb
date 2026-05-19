<script setup lang="ts">
// * /admin/contact — singleton contact form. Admin only.
import { useContactStore, type SocialLink } from '~/stores/contact'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t } = useI18n()
const contact = useContactStore()

const address = ref('')
const phone = ref('')
const email = ref('')
const mapsUrl = ref('')
const whoWeAre = ref('')
const social = ref<SocialLink[]>([])
const saving = ref(false)
const saved = ref(false)
const errorMsg = ref<string | null>(null)

await useAsyncData('admin-contact-page', async () => { await contact.fetch(); return true })

watch(
  () => contact.info,
  (info) => {
    address.value = info?.address ?? ''
    phone.value = info?.phone ?? ''
    email.value = info?.email ?? ''
    mapsUrl.value = info?.google_maps_embed_url ?? ''
    whoWeAre.value = info?.who_we_are ?? ''
    social.value = Array.isArray(info?.social_media) ? [...info.social_media] : []
  },
  { immediate: true },
)

const PLATFORMS: Array<{ value: string; icon: string; label: string }> = [
  { value: 'facebook', icon: 'i-lucide-facebook', label: 'Facebook' },
  { value: 'instagram', icon: 'i-lucide-instagram', label: 'Instagram' },
  { value: 'twitter', icon: 'i-lucide-twitter', label: 'Twitter / X' },
  { value: 'linkedin', icon: 'i-lucide-linkedin', label: 'LinkedIn' },
  { value: 'youtube', icon: 'i-lucide-youtube', label: 'YouTube' },
  { value: 'tiktok', icon: 'i-lucide-music-2', label: 'TikTok' },
  { value: 'other', icon: 'i-lucide-link', label: 'Autre' },
]

// * If admin pastes a full `<iframe ...>` HTML snippet, auto-extract the src.
// * Google Maps' "Share → Embed a map" gives an HTML tag — non-tech users paste it whole.
watch(mapsUrl, (val) => {
  if (!val) return
  const m = val.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)
  if (m && m[1]) mapsUrl.value = m[1]
})

const mapsUrlValid = computed(() => {
  const v = mapsUrl.value.trim()
  if (!v) return true
  return v.startsWith('https://www.google.com/maps/embed?')
})

function addSocial() {
  social.value.push({ platform: 'facebook', url: '', icon: 'i-lucide-facebook' })
}
function removeSocial(i: number) {
  social.value.splice(i, 1)
}
function setPlatform(i: number, platform: string) {
  const preset = PLATFORMS.find((p) => p.value === platform)
  social.value[i] = { ...social.value[i], platform, icon: preset?.icon ?? 'i-lucide-link' }
}

async function save() {
  errorMsg.value = null
  if (!mapsUrlValid.value) {
    errorMsg.value = t('admin.contact.mapsInvalid')
    return
  }
  saving.value = true
  saved.value = false
  try {
    await contact.save({
      address: address.value,
      phone: phone.value,
      email: email.value,
      google_maps_embed_url: mapsUrl.value,
      who_we_are: whoWeAre.value,
      social_media: social.value.filter((s) => s.url.trim()),
    })
    saved.value = true
    setTimeout(() => (saved.value = false), 3000)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.errors.generic')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <div>
      <h1 class="font-heading text-2xl font-bold">{{ t('admin.contact.title') }}</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.contact.subtitle') }}</p>
    </div>

    <form class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-6 space-y-5" @submit.prevent="save">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="block md:col-span-2">
          <span class="text-sm font-medium">{{ t('admin.contact.address') }}</span>
          <textarea
            v-model="address"
            rows="2"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.contact.phone') }}</span>
          <input
            v-model="phone"
            type="tel"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.contact.email') }}</span>
          <input
            v-model="email"
            type="email"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>

        <label class="block md:col-span-2">
          <span class="text-sm font-medium">{{ t('admin.contact.mapsUrl') }}</span>
          <textarea
            v-model="mapsUrl"
            rows="2"
            placeholder='<iframe src="https://www.google.com/maps/embed?..." …></iframe>'
            class="mt-1 w-full px-3 py-2 rounded-lg border bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none font-mono text-xs"
            :class="mapsUrlValid ? 'border-gray-300 dark:border-sidebar' : 'border-brand-secondary'"
          />
          <p v-if="!mapsUrlValid" class="text-xs text-brand-secondary mt-1">
            {{ t('admin.contact.mapsInvalid') }}
          </p>
          <p v-else class="text-xs text-gray-500 mt-1">{{ t('admin.contact.mapsHint') }}</p>
        </label>

        <label class="block md:col-span-2">
          <span class="text-sm font-medium">{{ t('admin.contact.whoWeAre') }}</span>
          <textarea
            v-model="whoWeAre"
            rows="6"
            :placeholder="t('admin.contact.whoWeAreHint')"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>
      </div>

      <div class="border-t border-gray-100 dark:border-sidebar pt-4">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium">{{ t('admin.contact.social') }}</span>
          <button
            type="button"
            class="text-xs text-brand-primary hover:underline"
            @click="addSocial"
          >
            + {{ t('admin.contact.addSocial') }}
          </button>
        </div>

        <div v-if="social.length === 0" class="text-xs text-gray-500 italic">
          {{ t('admin.contact.noSocial') }}
        </div>
        <div v-else class="space-y-2">
          <div v-for="(s, i) in social" :key="i" class="grid grid-cols-12 gap-2 items-center">
            <select
              :value="s.platform"
              class="col-span-4 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
              @change="setPlatform(i, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="p in PLATFORMS" :key="p.value" :value="p.value">{{ p.label }}</option>
            </select>
            <input
              v-model="s.url"
              type="url"
              placeholder="https://…"
              class="col-span-7 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
            />
            <button
              type="button"
              class="col-span-1 p-2 rounded-lg text-brand-secondary hover:bg-brand-secondary/10 justify-self-end"
              @click="removeSocial(i)"
            >
              <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>
      <p v-if="saved" class="text-sm text-brand-green">
        <UIcon name="i-lucide-check-circle-2" class="w-4 h-4 inline" />
        {{ t('admin.contact.saved') }}
      </p>

      <div class="flex justify-end pt-2">
        <button
          type="submit"
          :disabled="saving"
          class="px-5 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
        >
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </form>
  </div>
</template>
