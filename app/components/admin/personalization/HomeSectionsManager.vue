<script setup lang="ts">
// * Home sections manager — the dynamic entry-row sections shown on slide 0
// * of the home carousel. Rendered as the "Home sections" tab of
// * /admin/personalization. Each section is a category card that opens a panel
// * of URL links (managed under /admin/home-sections/[id]).
import { useHomeSectionsStore, type HomeSection } from '~/stores/homeSections'

const { t } = useI18n()
const sections = useHomeSectionsStore()
const client = useSupabaseClient()

const showForm = ref(false)
const editing = ref<HomeSection | null>(null)

const confirmOpen = ref(false)
const deleting = ref<HomeSection | null>(null)
const confirmBusy = ref(false)
const togglingId = ref<string | null>(null)

onMounted(() => {
  sections.fetchAll()
})

function logoUrl(path: string | null) {
  if (!path) return null
  const { data } = client.storage.from('home-section-logos').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function openCreate() {
  editing.value = null
  showForm.value = true
}
function openEdit(section: HomeSection) {
  editing.value = section
  showForm.value = true
}
function askDelete(section: HomeSection) {
  deleting.value = section
  confirmOpen.value = true
}
async function doDelete() {
  if (!deleting.value) return
  confirmBusy.value = true
  try {
    await sections.remove(deleting.value.id)
    confirmOpen.value = false
    deleting.value = null
  } finally {
    confirmBusy.value = false
  }
}
async function toggleVisible(section: HomeSection) {
  togglingId.value = section.id
  try {
    await sections.toggleVisible(section)
  } finally {
    togglingId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="font-heading text-xl font-bold">{{ t('admin.homeSections.title') }}</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.homeSections.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
        @click="openCreate"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        <span>{{ t('admin.homeSections.new') }}</span>
      </button>
    </div>

    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="sections.loading" class="p-10 text-center text-gray-500">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="sections.sorted.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-layout-grid" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.homeSections.empty') }}</p>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3">{{ t('admin.homeSections.col.logo') }}</th>
            <th class="px-4 py-3">{{ t('admin.homeSections.col.name') }}</th>
            <th class="px-4 py-3">{{ t('admin.homeSections.col.linksCount') }}</th>
            <th class="px-4 py-3">{{ t('admin.homeSections.col.color') }}</th>
            <th class="px-4 py-3 text-center">{{ t('admin.homeSections.col.visible') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.homeSections.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="section in sections.sorted"
            :key="section.id"
            class="border-t border-gray-100 dark:border-sidebar"
            :class="section.is_visible ? '' : 'opacity-60'"
          >
            <td class="px-4 py-3">
              <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden">
                <img
                  v-if="logoUrl(section.logo_path)"
                  :src="logoUrl(section.logo_path)!"
                  class="w-full h-full object-cover"
                  alt=""
                />
                <UIcon v-else name="i-lucide-layout-grid" class="w-5 h-5 text-gray-400" />
              </div>
            </td>
            <td class="px-4 py-3 font-medium">
              <div>{{ section.name }}</div>
              <div v-if="section.description" class="text-xs text-gray-500 mt-0.5">
                {{ section.description }}
              </div>
            </td>
            <td class="px-4 py-3 text-gray-600 dark:text-gray-300">
              <NuxtLink
                :to="`/admin/home-sections/${section.id}`"
                class="inline-flex items-center gap-1.5 text-brand-primary hover:underline"
              >
                <UIcon name="i-lucide-link" class="w-3.5 h-3.5" />
                {{ t('admin.homeSections.linksCount', { n: sections.linksFor(section.id).length }) }}
              </NuxtLink>
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <span
                  class="w-5 h-5 rounded border border-gray-300 dark:border-sidebar"
                  :style="{ backgroundColor: section.accent_color }"
                />
                <span class="text-xs text-gray-500 font-mono">{{ section.accent_color }}</span>
              </div>
            </td>
            <td class="px-4 py-3 text-center">
              <button
                type="button"
                :disabled="togglingId === section.id"
                class="p-2 rounded-lg transition disabled:opacity-50"
                :class="section.is_visible
                  ? 'text-brand-green hover:bg-brand-green/10'
                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-sidebar'"
                :title="section.is_visible
                  ? t('admin.homeSections.hide')
                  : t('admin.homeSections.show')"
                @click="toggleVisible(section)"
              >
                <UIcon
                  :name="section.is_visible ? 'i-lucide-eye' : 'i-lucide-eye-off'"
                  class="w-4 h-4"
                />
              </button>
            </td>
            <td class="px-4 py-3 text-right space-x-1">
              <NuxtLink
                :to="`/admin/home-sections/${section.id}`"
                class="inline-flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                :title="t('admin.homeSections.manageLinks')"
              >
                <UIcon name="i-lucide-list" class="w-4 h-4" />
              </NuxtLink>
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                @click="openEdit(section)"
              >
                <UIcon name="i-lucide-pencil" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary"
                @click="askDelete(section)"
              >
                <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AdminHomeSectionsFormModal
      v-model="showForm"
      :section="editing"
      @saved="sections.fetchAll()"
    />
    <AdminConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.homeSections.deleteTitle')"
      :message="t('admin.homeSections.deleteConfirm', { name: deleting?.name ?? '' })"
      :busy="confirmBusy"
      @confirm="doDelete"
    />
  </div>
</template>
