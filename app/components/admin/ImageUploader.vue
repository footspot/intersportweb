<script setup lang="ts">
// * Deferred image picker — does NOT upload on file select.
// * Preview: local ObjectURL for a pending File; else the existing storage path.
// * Parent collects { path, file } and sends both to its edge function on Save.
interface Props {
  bucket: string                 // * used only for public-URL preview of existing images
  path: string | null            // * existing storage path (edit mode) or null (new)
  file: File | null              // * newly-picked File not yet saved
  accept?: string
  label?: string
}
const props = withDefaults(defineProps<Props>(), {
  accept: 'image/*',
  label: '',
})
const emit = defineEmits<{
  (e: 'update:path', v: string | null): void   // * mostly for "remove"
  (e: 'update:file', v: File | null): void     // * newly-picked file
}>()

const { t } = useI18n()
const client = useSupabaseClient()
const error = ref<string | null>(null)

const objectUrl = ref<string | null>(null)
function releaseObjectUrl() {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value)
    objectUrl.value = null
  }
}
watch(
  () => props.file,
  (f) => {
    releaseObjectUrl()
    if (f) objectUrl.value = URL.createObjectURL(f)
  },
  { immediate: true },
)
onBeforeUnmount(releaseObjectUrl)

const storedUrl = computed(() => {
  if (!props.path) return null
  const { data } = client.storage.from(props.bucket).getPublicUrl(props.path)
  return data?.publicUrl ?? null
})

// * Priority: new file > existing stored image
const previewUrl = computed(() => objectUrl.value ?? storedUrl.value)

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  error.value = null
  // * Soft size guard (5 MB). The edge function will also enforce.
  if (file.size > 5 * 1024 * 1024) {
    error.value = t('admin.common.imageTooLarge')
    input.value = ''
    return
  }
  emit('update:file', file)
  input.value = ''
}

function clearImage() {
  emit('update:file', null)
  emit('update:path', null)
}
</script>

<template>
  <div>
    <p v-if="label" class="text-sm font-medium mb-2">{{ label }}</p>
    <div class="flex items-center gap-4">
      <div class="relative w-20 h-20 rounded-lg bg-gray-100 dark:bg-sidebar-surface border border-dashed border-gray-300 dark:border-sidebar flex items-center justify-center overflow-hidden">
        <img v-if="previewUrl" :src="previewUrl" class="w-full h-full object-cover" alt="" />
        <UIcon v-else name="i-lucide-image" class="w-6 h-6 text-gray-400" />
      </div>
      <div class="flex flex-col gap-2">
        <label class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-primary text-white text-sm font-medium cursor-pointer hover:bg-brand-primary-dark">
          <UIcon name="i-lucide-image-plus" class="w-4 h-4" />
          <span>{{ t('admin.common.choose') }}</span>
          <input type="file" :accept="accept" class="hidden" @change="onFile" />
        </label>
        <button
          v-if="file || path"
          type="button"
          class="text-xs text-brand-secondary hover:underline text-left"
          @click="clearImage"
        >
          {{ t('admin.common.removeImage') }}
        </button>
        <span v-if="file" class="text-xs text-gray-500 truncate max-w-[14rem]" :title="file.name">
          {{ file.name }} · {{ Math.round(file.size / 1024) }} KB
        </span>
      </div>
    </div>
    <p v-if="error" class="text-xs text-brand-secondary mt-2">{{ error }}</p>
  </div>
</template>
