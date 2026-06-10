<script setup lang="ts">
// * Manage the free-text product categories. Categories aren't a table — they're
// * the distinct `category` strings across products — so this lists them with a
// * usage count and lets staff RENAME (rewrites every matching product) or
// * DELETE (clears the category on every matching product). Renaming onto an
// * existing name merges the two buckets.
import { useProductsStore } from '~/stores/products'

interface Props {
  modelValue: boolean
}
defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', open: boolean): void }>()

const { t } = useI18n()
const products = useProductsStore()

// * Distinct categories + how many products use each, sorted alphabetically.
const categories = computed(() => {
  const counts = new Map<string, number>()
  for (const p of products.items) {
    if (p.category) counts.set(p.category, (counts.get(p.category) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
})

// * Per-row UI state.
const editingName = ref<string | null>(null)
const draft = ref('')
const busy = ref<string | null>(null)
const confirmingDelete = ref<string | null>(null)
const errorMsg = ref<string | null>(null)

function close() {
  if (busy.value) return
  editingName.value = null
  confirmingDelete.value = null
  errorMsg.value = null
  emit('update:modelValue', false)
}

function startRename(name: string) {
  editingName.value = name
  draft.value = name
  confirmingDelete.value = null
  errorMsg.value = null
}

async function saveRename(from: string) {
  const to = draft.value.trim()
  if (!to || to === from) {
    editingName.value = null
    return
  }
  busy.value = from
  errorMsg.value = null
  try {
    await products.updateCategory(from, to)
    editingName.value = null
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.errors.generic')
  } finally {
    busy.value = null
  }
}

async function doDelete(name: string) {
  busy.value = name
  errorMsg.value = null
  try {
    await products.updateCategory(name, null)
    confirmingDelete.value = null
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.errors.generic')
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
          <h3 class="font-heading text-xl font-bold">{{ t('admin.products.categoryManager.title') }}</h3>
          <p class="text-xs text-gray-500">{{ t('admin.products.categoryManager.hint') }}</p>
        </div>
        <button
          type="button"
          class="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-sidebar"
          :disabled="!!busy"
          @click="close"
        >
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <p v-if="categories.length === 0" class="text-sm text-gray-400 py-6 text-center">
        {{ t('admin.products.categoryManager.empty') }}
      </p>

      <ul v-else class="space-y-2 max-h-[60vh] overflow-y-auto">
        <li
          v-for="c in categories"
          :key="c.name"
          class="rounded-lg border border-gray-200 dark:border-sidebar p-3"
        >
          <!-- * Rename mode -->
          <div v-if="editingName === c.name" class="flex items-center gap-2">
            <input
              v-model="draft"
              type="text"
              class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
              @keyup.enter="saveRename(c.name)"
            />
            <button
              type="button"
              class="px-3 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
              :disabled="busy === c.name"
              @click="saveRename(c.name)"
            >
              <UIcon v-if="busy === c.name" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
              <span v-else>{{ t('common.save') }}</span>
            </button>
            <button
              type="button"
              class="px-3 py-2 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-sidebar"
              :disabled="busy === c.name"
              @click="editingName = null"
            >
              {{ t('common.cancel') }}
            </button>
          </div>

          <!-- * Delete confirmation -->
          <div v-else-if="confirmingDelete === c.name" class="flex items-center justify-between gap-2">
            <span class="text-sm text-brand-secondary">
              {{ t('admin.products.categoryManager.deleteConfirm', { n: c.count }) }}
            </span>
            <div class="flex items-center gap-2 shrink-0">
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-secondary text-white hover:bg-brand-secondary/90 disabled:opacity-60"
                :disabled="busy === c.name"
                @click="doDelete(c.name)"
              >
                <UIcon v-if="busy === c.name" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
                <span v-else>{{ t('common.delete') }}</span>
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-sidebar"
                :disabled="busy === c.name"
                @click="confirmingDelete = null"
              >
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>

          <!-- * Default row -->
          <div v-else class="flex items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="font-medium truncate capitalize">{{ c.name }}</div>
              <div class="text-xs text-gray-500">{{ t('admin.products.categoryManager.count', { n: c.count }) }}</div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                :aria-label="t('admin.products.categoryManager.rename')"
                :title="t('admin.products.categoryManager.rename')"
                @click="startRename(c.name)"
              >
                <UIcon name="i-lucide-pencil" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary"
                :aria-label="t('common.delete')"
                :title="t('common.delete')"
                @click="confirmingDelete = c.name; editingName = null"
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
          :disabled="!!busy"
          @click="close"
        >
          {{ t('common.close') }}
        </button>
      </div>
    </div>
  </div>
</template>
