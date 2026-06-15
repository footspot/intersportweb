<script setup lang="ts">
import { useHomeSectionsStore, type HomeSectionLink } from '~/stores/homeSections'

interface Props {
  modelValue: boolean
  sectionId: string
  link: HomeSectionLink | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const sections = useHomeSectionsStore()

const name = ref('')
const url = ref('')
const logoPath = ref<string | null>(null)
const logoFile = ref<File | null>(null)
const saving = ref(false)
const errorMsg = ref<string | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    name.value = props.link?.name ?? ''
    url.value = props.link?.url ?? ''
    logoPath.value = props.link?.logo_path ?? null
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
  if (!url.value.trim()) {
    errorMsg.value = t('admin.homeSections.errors.urlRequired')
    return
  }
  saving.value = true
  try {
    const clearLogo =
      !logoFile.value && !logoPath.value && !!props.link?.logo_path
    const sectionLinks = sections.linksFor(props.sectionId)
    const payload = {
      name: name.value.trim(),
      url: url.value.trim(),
      sort_order: props.link?.sort_order ?? sectionLinks.length,
      clear_logo: clearLogo,
      file: logoFile.value,
    }
    if (props.link) {
      await sections.updateLink({ id: props.link.id, ...payload })
    } else {
      await sections.createLink({ section_id: props.sectionId, ...payload })
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
        {{ link ? t('admin.homeSections.editLink') : t('admin.homeSections.newLink') }}
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
        <span class="text-sm font-medium">{{ t('admin.homeSections.url') }}</span>
        <input
          v-model="url"
          type="url"
          placeholder="https://…"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
      </label>

      <AdminImageUploader
        v-model:path="logoPath"
        v-model:file="logoFile"
        bucket="home-section-link-logos"
        :label="t('admin.homeSections.logo')"
      />

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
