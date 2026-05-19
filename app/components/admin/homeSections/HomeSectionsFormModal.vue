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
const sections = useHomeSectionsStore()

const name = ref('')
const description = ref('')
const accentColor = ref('#0331f9')
const isVisible = ref(true)
const logoPath = ref<string | null>(null)
const logoFile = ref<File | null>(null)
const saving = ref(false)
const errorMsg = ref<string | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    name.value = props.section?.name ?? ''
    description.value = props.section?.description ?? ''
    accentColor.value = props.section?.accent_color ?? '#0331f9'
    isVisible.value = props.section?.is_visible ?? true
    logoPath.value = props.section?.logo_path ?? null
    logoFile.value = null
    errorMsg.value = null
  },
  { immediate: true },
)

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
    const payload = {
      name: name.value.trim(),
      description: description.value.trim() || null,
      accent_color: accentColor.value.trim(),
      is_visible: isVisible.value,
      sort_order: props.section?.sort_order ?? sections.items.length,
      clear_logo: clearLogo,
      file: logoFile.value,
    }
    if (props.section) {
      await sections.update({ id: props.section.id, ...payload })
    } else {
      await sections.create(payload)
    }
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.errors.generic')
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
            v-model="accentColor"
            type="color"
            class="w-12 h-10 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent cursor-pointer"
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
