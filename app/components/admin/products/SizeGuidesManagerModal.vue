<script setup lang="ts">
// * Manage the brand size-guide library (admin only). Upload a named file
// * (image/PDF), rename it, replace its file, or delete it. Guides are assigned
// * to products from the product form; deleting one here removes it from every
// * product that used it (the join cascades).
import { useSizeGuidesStore } from '~/stores/sizeGuides'

interface Props {
  modelValue: boolean
}
defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', open: boolean): void }>()

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const guides = useSizeGuidesStore()
const supabase = useSupabaseClient()

// * New-guide draft.
const newName = ref('')
const newFile = ref<File | null>(null)
const newInput = ref<HTMLInputElement | null>(null)
const creating = ref(false)

// * Per-row state.
const editingId = ref<string | null>(null)
const draftName = ref('')
const busy = ref<string | null>(null)
const confirmingDelete = ref<string | null>(null)
const errorMsg = ref<string | null>(null)

function fileUrl(path: string): string | null {
  const { data } = supabase.storage.from('size-guides').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function isImage(type: string | null): boolean {
  return !!type && type.startsWith('image/')
}

onMounted(() => {
  guides.fetchAll()
})

function close() {
  if (busy.value || creating.value) return
  editingId.value = null
  confirmingDelete.value = null
  errorMsg.value = null
  emit('update:modelValue', false)
}

function onPickNewFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null
  newFile.value = f
}

async function createGuide() {
  const name = newName.value.trim()
  if (!name || !newFile.value) {
    errorMsg.value = t('admin.products.sizeGuides.errors.nameAndFile')
    return
  }
  creating.value = true
  errorMsg.value = null
  try {
    await guides.create(name, newFile.value)
    newName.value = ''
    newFile.value = null
    if (newInput.value) newInput.value.value = ''
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    creating.value = false
  }
}

function startRename(id: string, name: string) {
  editingId.value = id
  draftName.value = name
  confirmingDelete.value = null
  errorMsg.value = null
}

async function saveRename(id: string) {
  const to = draftName.value.trim()
  if (!to) {
    editingId.value = null
    return
  }
  busy.value = id
  errorMsg.value = null
  try {
    await guides.update(id, { name: to })
    editingId.value = null
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    busy.value = null
  }
}

// * Replace the underlying file for an existing guide (keeps its name + links).
async function replaceFile(id: string, e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0] ?? null
  if (!f) return
  busy.value = id
  errorMsg.value = null
  try {
    await guides.update(id, { file: f })
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    busy.value = null
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function doDelete(id: string) {
  busy.value = id
  errorMsg.value = null
  try {
    await guides.remove(id)
    confirmingDelete.value = null
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
    @click.self="close"
  >
    <div class="w-full max-w-lg my-8 bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-heading text-xl font-bold">{{ t('admin.products.sizeGuides.title') }}</h3>
          <p class="text-xs text-gray-500">{{ t('admin.products.sizeGuides.hint') }}</p>
        </div>
        <button
          type="button"
          class="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-sidebar"
          :disabled="!!busy || creating"
          @click="close"
        >
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>

      <!-- * Add a new guide -->
      <div class="rounded-lg border border-gray-200 dark:border-sidebar p-3 space-y-2">
        <span class="text-sm font-medium">{{ t('admin.products.sizeGuides.add') }}</span>
        <input
          v-model="newName"
          type="text"
          :placeholder="t('admin.products.sizeGuides.namePlaceholder')"
          class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
        <input
          ref="newInput"
          type="file"
          accept="image/*,application/pdf"
          class="w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-primary/10 file:text-brand-primary file:text-sm file:font-medium"
          @change="onPickNewFile"
        />
        <button
          type="button"
          class="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
          :disabled="creating || !newName.trim() || !newFile"
          @click="createGuide"
        >
          <UIcon v-if="creating" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          <UIcon v-else name="i-lucide-upload" class="w-4 h-4" />
          {{ t('admin.products.sizeGuides.upload') }}
        </button>
      </div>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <p v-if="guides.loading" class="text-sm text-gray-400 py-6 text-center">{{ t('common.loading') }}</p>
      <p v-else-if="guides.items.length === 0" class="text-sm text-gray-400 py-6 text-center">
        {{ t('admin.products.sizeGuides.empty') }}
      </p>

      <ul v-else class="space-y-2 max-h-[50vh] overflow-y-auto">
        <li
          v-for="g in guides.items"
          :key="g.id"
          class="rounded-lg border border-gray-200 dark:border-sidebar p-3"
        >
          <!-- * Rename mode -->
          <div v-if="editingId === g.id" class="flex items-center gap-2">
            <input
              v-model="draftName"
              type="text"
              class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
              @keyup.enter="saveRename(g.id)"
            />
            <button
              type="button"
              class="px-3 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
              :disabled="busy === g.id"
              @click="saveRename(g.id)"
            >
              <UIcon v-if="busy === g.id" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
              <span v-else>{{ t('common.save') }}</span>
            </button>
            <button
              type="button"
              class="px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-sidebar"
              :disabled="busy === g.id"
              @click="editingId = null"
            >
              {{ t('common.cancel') }}
            </button>
          </div>

          <!-- * Delete confirmation -->
          <div v-else-if="confirmingDelete === g.id" class="flex items-center justify-between gap-2">
            <span class="text-sm text-brand-secondary">{{ t('admin.products.sizeGuides.deleteConfirm') }}</span>
            <div class="flex items-center gap-2 shrink-0">
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-secondary text-white hover:bg-brand-secondary/90 disabled:opacity-60"
                :disabled="busy === g.id"
                @click="doDelete(g.id)"
              >
                <UIcon v-if="busy === g.id" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
                <span v-else>{{ t('common.delete') }}</span>
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-sidebar"
                :disabled="busy === g.id"
                @click="confirmingDelete = null"
              >
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>

          <!-- * Default row -->
          <div v-else class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-sidebar overflow-hidden shrink-0 flex items-center justify-center">
                <img v-if="isImage(g.file_type)" :src="fileUrl(g.file_path)!" class="w-full h-full object-cover" :alt="g.name" />
                <UIcon v-else name="i-lucide-file-text" class="w-4 h-4 text-gray-400" />
              </div>
              <div class="min-w-0">
                <div class="font-medium truncate">{{ g.name }}</div>
                <a
                  :href="fileUrl(g.file_path)!"
                  target="_blank"
                  rel="noopener"
                  class="text-xs text-brand-primary hover:underline inline-flex items-center gap-1"
                >
                  <UIcon name="i-lucide-external-link" class="w-3 h-3" />
                  {{ t('admin.products.sizeGuides.view') }}
                </a>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <UIcon v-if="busy === g.id" name="i-lucide-loader-2" class="w-4 h-4 animate-spin text-gray-400" />
              <label
                v-else
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar cursor-pointer"
                :title="t('admin.products.sizeGuides.replace')"
              >
                <UIcon name="i-lucide-refresh-cw" class="w-4 h-4" />
                <input type="file" accept="image/*,application/pdf" class="hidden" @change="(e) => replaceFile(g.id, e)" />
              </label>
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                :title="t('admin.products.sizeGuides.rename')"
                @click="startRename(g.id, g.name)"
              >
                <UIcon name="i-lucide-pencil" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary"
                :title="t('common.delete')"
                @click="confirmingDelete = g.id; editingId = null"
              >
                <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
              </button>
            </div>
          </div>
        </li>
      </ul>

      <div class="flex justify-end pt-2 border-t border-gray-100 dark:border-sidebar">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
          :disabled="!!busy || creating"
          @click="close"
        >
          {{ t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>
