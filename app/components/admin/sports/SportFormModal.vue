<script setup lang="ts">
import { useSportsStore, type Sport } from '~/stores/sports'

interface Props {
  modelValue: boolean
  sport: Sport | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const sports = useSportsStore()

const name = ref('')
const iconPath = ref<string | null>(null)      // * existing path in storage (edit mode)
const iconFile = ref<File | null>(null)         // * new file picked, not yet uploaded
const useBackground = ref(false)                // * toggle the custom tile background
const backgroundColor = ref('#0331f9')          // * hex when enabled
const saving = ref(false)
const errorMsg = ref<string | null>(null)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    name.value = props.sport?.name.fr ?? ''
    iconPath.value = props.sport?.icon_path ?? null
    iconFile.value = null
    useBackground.value = !!props.sport?.background_color
    backgroundColor.value = props.sport?.background_color ?? '#0331f9'
    errorMsg.value = null
  },
  { immediate: true },
)

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function save() {
  errorMsg.value = null
  const trimmed = name.value.trim()
  if (!trimmed) {
    errorMsg.value = t('admin.sports.errors.nameRequired')
    return
  }
  saving.value = true
  try {
    const clearIcon = !iconFile.value && !iconPath.value && !!props.sport?.icon_path
    // * Schema stores bilingual jsonb; with a single input we mirror the French
    // * value into both keys so the server contract stays unchanged.
    const base = {
      name: { fr: trimmed, en: trimmed },
      file: iconFile.value,
      clear_icon: clearIcon,
      background_color: useBackground.value ? backgroundColor.value : null,
    }
    if (props.sport) {
      await sports.update({ id: props.sport.id, ...base })
    } else {
      await sports.create({ ...base, sort_order: sports.items.length })
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
    @click.self="close"
  >
    <div class="w-full max-w-lg bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
      <h3 class="font-heading text-xl font-bold">
        {{ sport ? t('admin.sports.edit') : t('admin.sports.new') }}
      </h3>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.sports.name') }}</span>
        <input
          v-model="name"
          type="text"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
      </label>

      <AdminImageUploader
        v-model:path="iconPath"
        v-model:file="iconFile"
        bucket="sports-icons"
        :label="t('admin.sports.icon')"
      />

      <!-- * Tile background color (optional) -->
      <div class="space-y-2">
        <label class="flex items-center gap-3 cursor-pointer">
          <input v-model="useBackground" type="checkbox" class="w-4 h-4 accent-brand-primary" />
          <span class="text-sm font-medium">{{ t('admin.sports.backgroundColor') }}</span>
        </label>
        <div v-if="useBackground" class="flex items-center gap-2 pl-7">
          <input
            :value="backgroundColor"
            type="color"
            class="h-9 w-14 rounded-lg cursor-pointer border border-gray-300 dark:border-sidebar p-0.5 bg-transparent"
            @input="backgroundColor = ($event.target as HTMLInputElement).value"
          />
          <input
            v-model="backgroundColor"
            type="text"
            placeholder="#0331f9"
            class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none font-mono text-sm"
          />
        </div>
        <p class="text-xs text-gray-400 pl-7">{{ t('admin.sports.backgroundColorHint') }}</p>
      </div>

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
