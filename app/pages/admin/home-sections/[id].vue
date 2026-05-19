<script setup lang="ts">
// * /admin/home-sections/[id] — admin-only. Manages the URL links inside a
// * single home section (the category card on slide 0 of the home carousel).
import { useHomeSectionsStore, type HomeSectionLink } from '~/stores/homeSections'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const route = useRoute()
const { t } = useI18n()
const sections = useHomeSectionsStore()
const client = useSupabaseClient()

const sectionId = computed(() => route.params.id as string)
const section = computed(() => sections.byId(sectionId.value))
const links = computed(() => sections.linksFor(sectionId.value))

const showForm = ref(false)
const editing = ref<HomeSectionLink | null>(null)

const confirmOpen = ref(false)
const deleting = ref<HomeSectionLink | null>(null)
const confirmBusy = ref(false)

await useAsyncData(`admin-home-section-${sectionId.value}`, async () => {
  await sections.fetchAll()
  return true
})

function logoUrl(path: string | null) {
  if (!path) return null
  const { data } = client.storage.from('home-section-link-logos').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function openCreate() {
  editing.value = null
  showForm.value = true
}
function openEdit(link: HomeSectionLink) {
  editing.value = link
  showForm.value = true
}
function askDelete(link: HomeSectionLink) {
  deleting.value = link
  confirmOpen.value = true
}
async function doDelete() {
  if (!deleting.value) return
  confirmBusy.value = true
  try {
    await sections.removeLink(deleting.value.id)
    confirmOpen.value = false
    deleting.value = null
  } finally {
    confirmBusy.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <NuxtLink
          to="/admin/home-sections"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand-primary"
        >
          <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
          {{ t('admin.homeSections.backToList') }}
        </NuxtLink>
        <span class="text-gray-300">/</span>
        <h1 class="font-heading text-2xl font-bold truncate">
          {{ section?.name ?? t('common.loading') }}
        </h1>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
        :disabled="!section"
        @click="openCreate"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        <span>{{ t('admin.homeSections.newLink') }}</span>
      </button>
    </div>

    <p class="text-sm text-gray-500 dark:text-gray-400">
      {{ t('admin.homeSections.linksSubtitle') }}
    </p>

    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="sections.loading" class="p-10 text-center text-gray-500">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="!section" class="p-10 text-center">
        <UIcon name="i-lucide-alert-circle" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.homeSections.notFound') }}</p>
      </div>
      <div v-else-if="links.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-link" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.homeSections.linksEmpty') }}</p>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3">{{ t('admin.homeSections.col.logo') }}</th>
            <th class="px-4 py-3">{{ t('admin.homeSections.col.name') }}</th>
            <th class="px-4 py-3">{{ t('admin.homeSections.col.url') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.homeSections.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="link in links"
            :key="link.id"
            class="border-t border-gray-100 dark:border-sidebar"
          >
            <td class="px-4 py-3">
              <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden">
                <img
                  v-if="logoUrl(link.logo_path)"
                  :src="logoUrl(link.logo_path)!"
                  class="w-full h-full object-cover"
                  alt=""
                />
                <UIcon v-else name="i-lucide-link" class="w-5 h-5 text-gray-400" />
              </div>
            </td>
            <td class="px-4 py-3 font-medium">{{ link.name }}</td>
            <td class="px-4 py-3 text-xs text-gray-500 truncate max-w-xs">
              <a
                :href="link.url"
                target="_blank"
                class="text-brand-primary hover:underline inline-flex items-center gap-1"
              >
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

    <AdminHomeSectionsLinkFormModal
      v-model="showForm"
      :section-id="sectionId"
      :link="editing"
      @saved="sections.fetchAll()"
    />
    <AdminConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.homeSections.deleteLinkTitle')"
      :message="t('admin.homeSections.deleteLinkConfirm', { name: deleting?.name ?? '' })"
      :busy="confirmBusy"
      @confirm="doDelete"
    />
  </div>
</template>
