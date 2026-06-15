<script setup lang="ts">
import { useHomeSectionsStore, type HomeSection } from '~/stores/homeSections'

interface Props {
  modelValue: boolean
  section: HomeSection | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const sections = useHomeSectionsStore()
const client = useSupabaseClient()

const name = ref('')
const description = ref('')
const accentColor = ref('#0331f9')
const textColor = ref('#ffffff')
const coverGradient = ref(true)
const isVisible = ref(true)
const logoPath = ref<string | null>(null)
const logoFile = ref<File | null>(null)
const coverPath = ref<string | null>(null)
const coverFile = ref<File | null>(null)
const saving = ref(false)
const errorMsg = ref<string | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    name.value = props.section?.name ?? ''
    description.value = props.section?.description ?? ''
    accentColor.value = props.section?.accent_color ?? '#0331f9'
    coverGradient.value = props.section?.cover_gradient ?? true
    // * Default text color follows the gradient (white over it, black otherwise).
    textColor.value = props.section?.text_color ?? (coverGradient.value ? '#ffffff' : '#000000')
    isVisible.value = props.section?.is_visible ?? true
    logoPath.value = props.section?.logo_path ?? null
    logoFile.value = null
    coverPath.value = props.section?.cover_image_path ?? null
    coverFile.value = null
    errorMsg.value = null
  },
  { immediate: true },
)

// * Object URL for a freshly-picked cover, used by the live preview.
const coverObjectUrl = ref<string | null>(null)
watch(
  coverFile,
  (f) => {
    if (coverObjectUrl.value) URL.revokeObjectURL(coverObjectUrl.value)
    coverObjectUrl.value = f ? URL.createObjectURL(f) : null
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  if (coverObjectUrl.value) URL.revokeObjectURL(coverObjectUrl.value)
})
const coverPreviewUrl = computed(() => {
  if (coverObjectUrl.value) return coverObjectUrl.value
  if (coverPath.value) {
    return client.storage.from('home-section-covers').getPublicUrl(coverPath.value).data?.publicUrl ?? null
  }
  return null
})

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function save() {
  errorMsg.value = null
  if (!name.value.trim()) {
    errorMsg.value = t('admin.homeSections.errors.nameRequired')
    return
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(accentColor.value.trim())) {
    errorMsg.value = t('admin.homeSections.errors.colorInvalid')
    return
  }
  saving.value = true
  try {
    const clearLogo =
      !logoFile.value && !logoPath.value && !!props.section?.logo_path
    const clearCover =
      !coverFile.value && !coverPath.value && !!props.section?.cover_image_path
    const payload = {
      name: name.value.trim(),
      description: description.value.trim() || null,
      accent_color: accentColor.value.trim(),
      text_color: textColor.value.trim(),
      cover_gradient: coverGradient.value,
      is_visible: isVisible.value,
      sort_order: props.section?.sort_order ?? sections.items.length,
      clear_logo: clearLogo,
      clear_cover: clearCover,
      file: logoFile.value,
      cover_file: coverFile.value,
    }
    if (props.section) {
      await sections.update({ id: props.section.id, ...payload })
    } else {
      await sections.create(payload)
    }
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
  >
    <div class="w-full max-w-lg bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
      <h3 class="font-heading text-xl font-bold">
        {{ section ? t('admin.homeSections.edit') : t('admin.homeSections.new') }}
      </h3>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.homeSections.name') }}</span>
        <input
          v-model="name"
          type="text"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.homeSections.description') }}</span>
        <input
          v-model="description"
          type="text"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          :placeholder="t('admin.homeSections.descriptionPlaceholder')"
        />
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.homeSections.accentColor') }}</span>
        <div class="mt-1 flex items-center gap-2">
          <input
            :value="accentColor || '#0331f9'"
            type="color"
            class="w-12 h-10 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent cursor-pointer"
            @input="accentColor = ($event.target as HTMLInputElement).value"
          />
          <input
            v-model="accentColor"
            type="text"
            placeholder="#0331f9"
            class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none font-mono text-sm"
          />
        </div>
      </label>

      <AdminImageUploader
        v-model:path="logoPath"
        v-model:file="logoFile"
        bucket="home-section-logos"
        :label="t('admin.homeSections.logo')"
      />

      <div>
        <AdminImageUploader
          v-model:path="coverPath"
          v-model:file="coverFile"
          bucket="home-section-covers"
          :label="t('admin.homeSections.cover')"
        />
        <p class="text-xs text-gray-500 mt-1.5">{{ t('admin.homeSections.coverHint') }}</p>
      </div>

      <label v-if="coverPath || coverFile" class="flex items-center gap-3 select-none cursor-pointer">
        <input
          v-model="coverGradient"
          type="checkbox"
          class="w-4 h-4 rounded border-gray-300 dark:border-sidebar text-brand-primary focus:ring-brand-primary"
          @change="textColor = ($event.target as HTMLInputElement).checked ? '#ffffff' : '#000000'"
        />
        <span class="text-sm font-medium">{{ t('admin.homeSections.gradient') }}</span>
      </label>

      <label v-if="coverPath || coverFile" class="block">
        <span class="text-sm font-medium">{{ t('admin.homeSections.textColor') }}</span>
        <div class="mt-1 flex items-center gap-2">
          <input
            :value="textColor || '#000000'"
            type="color"
            class="w-12 h-10 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent cursor-pointer"
            @input="textColor = ($event.target as HTMLInputElement).value"
          />
          <input
            v-model="textColor"
            type="text"
            placeholder="#000000"
            class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none font-mono text-sm"
          />
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('admin.homeSections.textColorHint') }}</p>
      </label>

      <!-- * Live preview of the storefront card. -->
      <div v-if="coverPreviewUrl">
        <p class="text-sm font-medium mb-2">{{ t('admin.homeSections.preview') }}</p>
        <HomeEntryCard
          class="w-full max-w-[300px]"
          :accent="accentColor || '#0331f9'"
          :title="name || t('admin.homeSections.name')"
          :desc="description"
          :cta="t('nav.catalog')"
          :cover="coverPreviewUrl"
          :text-color="textColor || null"
          :gradient="coverGradient"
        />
      </div>

      <label class="flex items-center gap-3 select-none cursor-pointer">
        <input
          v-model="isVisible"
          type="checkbox"
          class="w-4 h-4 rounded border-gray-300 dark:border-sidebar text-brand-primary focus:ring-brand-primary"
        />
        <span class="text-sm font-medium">{{ t('admin.homeSections.visible') }}</span>
      </label>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
          :disabled="saving"
          @click="close"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
