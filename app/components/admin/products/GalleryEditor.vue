<script setup lang="ts">
// * Multi-image editor for products. Up to `maxImages` slots (default 10),
// * position 0 = primary. Each slot is either an existing storage path or a
// * pending File (not yet uploaded). The parent collects slots + files and
// * submits both to the edge function on Save.
import type { DraftColor } from './ProductColorsEditor.vue'

export interface GallerySlot {
  id: string        // * stable v-for key (ProductImage.id for existing, random for new)
  existing?: string // * pre-existing storage path
  file?: File       // * newly picked file, not yet uploaded
  color_key?: string | null // * the color this image belongs to (null = every color)
}

interface Props {
  modelValue: GallerySlot[]
  bucket: string
  maxImages?: number
  label?: string
  clubLogoUrl?: string | null   // * selected club's logo, passed to the overlay editor
  // * Defined colors; when non-empty each image gets a color assignment dropdown.
  colors?: DraftColor[]
}
const props = withDefaults(defineProps<Props>(), { maxImages: 10, label: '', clubLogoUrl: null, colors: () => [] })
const emit = defineEmits<{ (e: 'update:modelValue', v: GallerySlot[]): void }>()

const { t } = useI18n()
const client = useSupabaseClient()
const error = ref<string | null>(null)

// * Logo/text overlay editor state — bakes the chosen slot's image in place.
const overlayOpen = ref(false)
const overlayIndex = ref<number | null>(null)
const overlayBgUrl = computed(() => {
  // * Guard: the targeted slot may have been deleted while the index lingers.
  if (overlayIndex.value == null) return null
  const slot = props.modelValue[overlayIndex.value]
  return slot ? previewUrl(slot) : null
})

function openOverlay(index: number) {
  overlayIndex.value = index
  overlayOpen.value = true
}

// * Clear the target index once the editor closes so a later slot deletion
// * can't point the background URL at a removed slot.
watch(overlayOpen, (open) => {
  if (!open) overlayIndex.value = null
})

// * Replace the edited slot's image with the flattened PNG (destructive bake).
// * Keep the slot id (gallery position) AND its color_key — dropping the latter
// * silently turned a per-color image into an "all colors" one, which spawned
// * duplicate/wrong thumbnails on the storefront. `existing` is cleared since the
// * baked file now supersedes any previously-uploaded path.
function onOverlayApplied(file: File) {
  if (overlayIndex.value == null) return
  const next = props.modelValue.slice()
  const slot = next[overlayIndex.value]
  next[overlayIndex.value] = { id: slot.id, file, color_key: slot.color_key ?? null }
  emitNext(next)
}

// * Cache object URLs per File so we don't leak on re-renders.
const objectUrls = new Map<File, string>()
function urlForFile(file: File): string {
  let url = objectUrls.get(file)
  if (!url) {
    url = URL.createObjectURL(file)
    objectUrls.set(file, url)
  }
  return url
}
onBeforeUnmount(() => {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
})

function previewUrl(slot: GallerySlot): string | null {
  if (slot.file) return urlForFile(slot.file)
  if (slot.existing) {
    const { data } = client.storage.from(props.bucket).getPublicUrl(slot.existing)
    return data?.publicUrl ?? null
  }
  return null
}

const canAddMore = computed(() => props.modelValue.length < props.maxImages)

function emitNext(next: GallerySlot[]) {
  emit('update:modelValue', next)
}

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  error.value = null
  const remaining = props.maxImages - props.modelValue.length
  const toAdd: GallerySlot[] = []
  for (let i = 0; i < files.length && toAdd.length < remaining; i++) {
    const f = files[i]
    if (f.size > 5 * 1024 * 1024) {
      error.value = t('admin.common.imageTooLarge')
      continue
    }
    toAdd.push({ id: crypto.randomUUID(), file: f })
  }
  if (toAdd.length > 0) emitNext([...props.modelValue, ...toAdd])
  input.value = ''
}

function removeSlot(index: number) {
  const next = props.modelValue.slice()
  next.splice(index, 1)
  emitNext(next)
}

function makePrimary(index: number) {
  if (index === 0) return
  const next = props.modelValue.slice()
  const [moved] = next.splice(index, 1)
  next.unshift(moved)
  emitNext(next)
}

const hasColors = computed(() => props.colors.length > 0)

function setColor(index: number, key: string | null) {
  const next = props.modelValue.slice()
  next[index] = { ...next[index], color_key: key || null }
  emitNext(next)
}
</script>

<template>
  <div>
    <p v-if="label" class="text-sm font-medium mb-2">{{ label }}</p>

    <div class="flex flex-wrap gap-3">
      <div v-for="(slot, i) in modelValue" :key="slot.id" class="flex flex-col gap-1">
      <div
        class="relative w-[7.2rem] h-[7.2rem] rounded-lg border border-gray-200 dark:border-sidebar bg-gray-50 dark:bg-sidebar-surface overflow-hidden group"
      >
        <img
          v-if="previewUrl(slot)"
          :src="previewUrl(slot)!"
          class="w-full h-full object-cover"
          alt=""
        />
        <span
          v-if="i === 0"
          class="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-primary text-white"
        >
          {{ t('admin.products.gallery.primary') }}
        </span>
        <button
          v-if="previewUrl(slot)"
          type="button"
          class="absolute top-1 right-1 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-brand-primary"
          :title="t('admin.products.overlay.edit')"
          @click="openOverlay(i)"
        >
          <UIcon name="i-lucide-stamp" class="w-3.5 h-3.5" />
        </button>
        <div class="absolute inset-x-0 bottom-0 flex justify-between bg-black/50 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            v-if="i !== 0"
            type="button"
            class="flex-1 px-1 py-1 hover:bg-brand-primary"
            :title="t('admin.products.gallery.makePrimary')"
            @click="makePrimary(i)"
          >
            {{ t('admin.products.gallery.makePrimary') }}
          </button>
          <button
            type="button"
            class="flex-1 px-1 py-1 hover:bg-brand-secondary"
            :title="t('admin.common.removeImage')"
            @click="removeSlot(i)"
          >
            {{ t('common.delete') }}
          </button>
        </div>
      </div>
        <!-- * Per-image color assignment (only when the product has colors). -->
        <select
          v-if="hasColors"
          :value="slot.color_key ?? ''"
          class="w-[7.2rem] px-1.5 py-1 rounded-md border border-gray-300 dark:border-sidebar bg-transparent text-xs focus:ring-2 focus:ring-brand-primary focus:outline-none"
          @change="setColor(i, ($event.target as HTMLSelectElement).value || null)"
        >
          <option value="">{{ t('admin.products.colors.imageAll') }}</option>
          <option v-for="c in colors" :key="c.key" :value="c.key">{{ c.name || '—' }}</option>
        </select>
      </div>

      <label
        v-if="canAddMore"
        class="w-[7.2rem] h-[7.2rem] rounded-lg border border-dashed border-gray-300 dark:border-sidebar flex flex-col items-center justify-center cursor-pointer hover:border-brand-primary hover:text-brand-primary text-gray-400"
      >
        <UIcon name="i-lucide-image-plus" class="w-6 h-6" />
        <span class="text-[10px] mt-1">{{ t('admin.common.choose') }}</span>
        <input type="file" accept="image/*" multiple class="hidden" @change="onPick" />
      </label>
    </div>

    <p class="text-xs text-gray-500 mt-2">
      {{ t('admin.products.gallery.hint', { max: maxImages }) }}
    </p>
    <p v-if="error" class="text-xs text-brand-secondary mt-1">{{ error }}</p>

    <AdminProductsLogoOverlayEditor
      v-model="overlayOpen"
      :background-url="overlayBgUrl"
      :club-logo-url="clubLogoUrl"
      @applied="onOverlayApplied"
    />
  </div>
</template>
