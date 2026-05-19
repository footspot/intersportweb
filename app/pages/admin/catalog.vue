<script setup lang="ts">
// * /admin/catalog — admin-only. Manages the links shown on the public /catalog page.
import { useCatalogStore, type CatalogLink } from '~/stores/catalog'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t } = useI18n()
const catalog = useCatalogStore()
const client = useSupabaseClient()

const showForm = ref(false)
const editing = ref<CatalogLink | null>(null)

const confirmOpen = ref(false)
const deleting = ref<CatalogLink | null>(null)
const confirmBusy = ref(false)

await useAsyncData('admin-catalog-page', async () => { await catalog.fetchAll(); return true })

function logoUrl(path: string | null) {
  if (!path) return null
  const { data } = client.storage.from('catalog-logos').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function openCreate() {
  editing.value = null
  showForm.value = true
}
function openEdit(link: CatalogLink) {
  editing.value = link
  showForm.value = true
}
function askDelete(link: CatalogLink) {
  deleting.value = link
  confirmOpen.value = true
}
async function doDelete() {
  if (!deleting.value) return
  confirmBusy.value = true
  try {
    await catalog.remove(deleting.value.id)
    confirmOpen.value = false
    deleting.value = null
  } finally {
    confirmBusy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.catalog.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.catalog.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
        @click="openCreate"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        <span>{{ t('admin.catalog.new') }}</span>
      </button>
    </div>

    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="catalog.loading" class="p-10 text-center text-gray-500">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="catalog.sorted.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-book-open" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.catalog.empty') }}</p>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3">{{ t('admin.catalog.col.logo') }}</th>
            <th class="px-4 py-3">{{ t('admin.catalog.col.name') }}</th>
            <th class="px-4 py-3">{{ t('admin.catalog.col.url') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.catalog.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="link in catalog.sorted" :key="link.id" class="border-t border-gray-100 dark:border-sidebar">
            <td class="px-4 py-3">
              <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden">
                <img v-if="logoUrl(link.logo_path)" :src="logoUrl(link.logo_path)!" class="w-full h-full object-cover" alt="" />
                <UIcon v-else name="i-lucide-book-open" class="w-5 h-5 text-gray-400" />
              </div>
            </td>
            <td class="px-4 py-3 font-medium">{{ link.name }}</td>
            <td class="px-4 py-3 text-xs text-gray-500 truncate max-w-xs">
              <a :href="link.url" target="_blank" class="text-brand-primary hover:underline inline-flex items-center gap-1">
                <UIcon name="i-lucide-external-link" class="w-3 h-3" />
                {{ link.url }}
              </a>
            </td>
            <td class="px-4 py-3 text-right space-x-1">
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                @click="openEdit(link)"
              >
                <UIcon name="i-lucide-pencil" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary"
                @click="askDelete(link)"
              >
                <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AdminCatalogLinkFormModal
      v-model="showForm"
      :link="editing"
      @saved="catalog.fetchAll()"
    />
    <AdminConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.catalog.deleteTitle')"
      :message="t('admin.catalog.deleteConfirm', { name: deleting?.name ?? '' })"
      :busy="confirmBusy"
      @confirm="doDelete"
    />
  </div>
</template>
