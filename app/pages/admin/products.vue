<script setup lang="ts">
// * /admin/products — admin + employee. Full CRUD: pricing, discounts, variants, flocking.
import { useProductsStore, type Product } from '~/stores/products'
import { useClubsStore } from '~/stores/clubs'
import { useSiteSettingsStore } from '~/stores/siteSettings'

definePageMeta({ layout: 'admin', middleware: ['backoffice'], ssr: false })

const { t } = useI18n()
const { edgeErrorMessage, notifyEdgeError } = useEdgeError()
const products = useProductsStore()
const clubs = useClubsStore()
const settings = useSiteSettingsStore()

type VisibilityFilter = 'all' | 'visible' | 'hidden'
const clubFilter = ref<'all' | string>('all')
const visibility = ref<VisibilityFilter>('all')
const clearanceOnly = ref(false)
const search = ref('')

const togglingClearance = ref<string[]>([])
const togglingClearanceMaster = ref(false)
const clearanceCount = computed(
  () => products.items.filter((p) => p.is_on_clearance).length,
)

async function toggleClearanceMaster() {
  togglingClearanceMaster.value = true
  try {
    await settings.toggleClearance()
  } catch (err) {
    notifyEdgeError(err)
  } finally {
    togglingClearanceMaster.value = false
  }
}

async function toggleClearanceFlag(p: Product) {
  togglingClearance.value = [...togglingClearance.value, p.id]
  try {
    await products.toggleClearance(p)
  } catch (err) {
    notifyEdgeError(err)
  } finally {
    togglingClearance.value = togglingClearance.value.filter((id) => id !== p.id)
  }
}

const showForm = ref(false)
const editing = ref<Product | null>(null)
const showCategories = ref(false)

const confirmOpen = ref(false)
const deleting = ref<Product | null>(null)
const confirmBusy = ref(false)
const deleteError = ref<string | null>(null)

const previewOpen = ref(false)
const previewing = ref<Product | null>(null)

const togglingIds = ref<string[]>([])
const duplicatingIds = ref<string[]>([])
const savingOrder = ref(false)

// * Drag-to-reorder is only offered on a clean single-club view — reordering a
// * search/visibility-filtered subset would produce a confusing partial order.
const reorderable = computed(
  () =>
    clubFilter.value !== 'all' &&
    !search.value.trim() &&
    visibility.value === 'all' &&
    !clearanceOnly.value,
)

await useAsyncData('admin-products-page', async () => {
  await Promise.all([clubs.fetchAll(), products.fetchAll(), settings.fetchAll()])
  return true
})

const filtered = computed<Product[]>(() => {
  const q = search.value.trim().toLowerCase()
  return products.items.filter((p) => {
    if (clubFilter.value !== 'all' && p.club_id !== clubFilter.value) return false
    if (visibility.value === 'visible' && !p.is_visible) return false
    if (visibility.value === 'hidden' && p.is_visible) return false
    if (clearanceOnly.value && !p.is_on_clearance) return false
    if (q) {
      const hay = `${p.reference} ${p.name.fr}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

function openCreate() {
  editing.value = null
  showForm.value = true
}
function openEdit(p: Product) {
  editing.value = p
  showForm.value = true
}
function openPreview(p: Product) {
  previewing.value = p
  previewOpen.value = true
}

function askDelete(p: Product) {
  deleting.value = p
  deleteError.value = null
  confirmOpen.value = true
}
async function doDelete() {
  if (!deleting.value) return
  confirmBusy.value = true
  deleteError.value = null
  try {
    await products.remove(deleting.value.id)
    confirmOpen.value = false
    deleting.value = null
  } catch (err: any) {
    if (err?.message === 'product_has_orders') {
      deleteError.value = t('admin.products.errors.hasOrders')
    } else {
      deleteError.value = edgeErrorMessage(err)
    }
  } finally {
    confirmBusy.value = false
  }
}

async function toggleVisible(p: Product) {
  togglingIds.value = [...togglingIds.value, p.id]
  try {
    await products.toggleVisibility(p)
  } catch (err) {
    notifyEdgeError(err)
  } finally {
    togglingIds.value = togglingIds.value.filter((id) => id !== p.id)
  }
}

// * Persist the new product order (one club). The committed list is the
// * displayed order; sort_order becomes its index.
async function onReorder(ordered: Product[]) {
  savingOrder.value = true
  try {
    await products.reorder(ordered.map((p, idx) => ({ id: p.id, sort_order: idx })))
  } catch (err) {
    notifyEdgeError(err)
    await products.fetchAll()
  } finally {
    savingOrder.value = false
  }
}

// * Duplicate a product into a hidden draft, then open it for editing.
async function duplicate(p: Product) {
  duplicatingIds.value = [...duplicatingIds.value, p.id]
  try {
    const copy = await products.duplicate(p.id)
    if (copy) openEdit(copy)
  } catch (err) {
    notifyEdgeError(err)
  } finally {
    duplicatingIds.value = duplicatingIds.value.filter((id) => id !== p.id)
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.products.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.products.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="relative">
          <input
            v-model="search"
            type="text"
            :placeholder="t('admin.products.searchPlaceholder')"
            class="w-80 pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
          <UIcon name="i-lucide-search" class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-sidebar text-sm font-medium hover:bg-gray-50 dark:hover:bg-sidebar"
          @click="showCategories = true"
        >
          <UIcon name="i-lucide-tags" class="w-4 h-4" />
          <span>{{ t('admin.products.categoryManager.button') }}</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
          :disabled="clubs.items.length === 0"
          @click="openCreate"
        >
          <UIcon name="i-lucide-plus" class="w-4 h-4" />
          <span>{{ t('admin.products.new') }}</span>
        </button>
      </div>
    </div>

    <div v-if="clubs.items.length === 0" class="bg-brand-gold/10 border border-brand-gold/30 text-brand-gold rounded-card p-4 text-sm">
      <UIcon name="i-lucide-info" class="w-4 h-4 inline mr-1" />
      {{ t('admin.products.noClubsHint') }}
      <NuxtLink to="/admin/clubs" class="underline ml-2">{{ t('admin.products.goCreateClub') }}</NuxtLink>
    </div>

    <!-- Clearance master toggle -->
    <div
      class="rounded-card p-4 border flex items-center justify-between gap-4 flex-wrap"
      :class="settings.clearanceActive
        ? 'bg-brand-secondary/5 border-brand-secondary/40'
        : 'bg-gray-50 dark:bg-sidebar border-gray-200 dark:border-sidebar'"
    >
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          :class="settings.clearanceActive ? 'bg-brand-secondary text-white' : 'bg-gray-200 dark:bg-sidebar-surface text-gray-500'"
        >
          <UIcon name="i-lucide-tag" class="w-5 h-5" />
        </div>
        <div class="min-w-0">
          <div class="font-heading font-bold text-sm flex items-center gap-2">
            {{ t('admin.products.clearance.bannerTitle') }}
            <span
              v-if="settings.clearanceActive"
              class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-secondary text-white"
            >
              {{ t('admin.products.clearance.live') }}
            </span>
          </div>
          <div class="text-xs text-gray-500 mt-0.5">
            {{ settings.clearanceActive
              ? t('admin.products.clearance.bannerActiveHint', { n: clearanceCount })
              : t('admin.products.clearance.bannerInactiveHint', { n: clearanceCount }) }}
          </div>
        </div>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition disabled:opacity-60"
        :class="settings.clearanceActive
          ? 'bg-brand-secondary text-white hover:bg-brand-secondary/90'
          : 'bg-white dark:bg-sidebar-surface border border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
        :disabled="togglingClearanceMaster || (clearanceCount === 0 && !settings.clearanceActive)"
        :title="clearanceCount === 0 && !settings.clearanceActive ? t('admin.products.clearance.bannerNoProducts') : ''"
        @click="toggleClearanceMaster"
      >
        <UIcon
          v-if="togglingClearanceMaster"
          name="i-lucide-loader-2"
          class="w-4 h-4 animate-spin"
        />
        <UIcon
          v-else
          :name="settings.clearanceActive ? 'i-lucide-eye' : 'i-lucide-eye-off'"
          class="w-4 h-4"
        />
        {{ settings.clearanceActive
          ? t('admin.products.clearance.deactivate')
          : t('admin.products.clearance.activate') }}
      </button>
    </div>

    <div class="flex flex-wrap gap-2 items-center">
      <button
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium"
        :class="clubFilter === 'all' ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="clubFilter = 'all'"
      >
        {{ t('admin.products.filter.allClubs') }}
      </button>
      <button
        v-for="c in clubs.items"
        :key="c.id"
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium"
        :class="clubFilter === c.id ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="clubFilter = c.id"
      >
        {{ c.name }}
      </button>
      <span class="w-px h-5 bg-gray-200 dark:bg-sidebar mx-1" />
      <button
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium"
        :class="visibility === 'all' ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="visibility = 'all'"
      >
        {{ t('admin.products.filter.all') }}
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium"
        :class="visibility === 'visible' ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="visibility = 'visible'"
      >
        {{ t('admin.products.filter.visible') }}
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium"
        :class="visibility === 'hidden' ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="visibility = 'hidden'"
      >
        {{ t('admin.products.filter.hidden') }}
      </button>
      <span class="w-px h-5 bg-gray-200 dark:bg-sidebar mx-1" />
      <button
        type="button"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
        :class="clearanceOnly ? 'bg-brand-secondary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
        @click="clearanceOnly = !clearanceOnly"
      >
        <UIcon name="i-lucide-tag" class="w-3.5 h-3.5" />
        {{ t('admin.products.filter.clearance') }}
      </button>
    </div>

    <div v-if="products.loading" class="p-10 text-center text-gray-500">
      {{ t('common.loading') }}
    </div>
    <template v-else>
    <p v-if="reorderable" class="flex items-center gap-1.5 text-xs text-gray-500 -mb-2">
      <UIcon name="i-lucide-grip-vertical" class="w-3.5 h-3.5" />
      {{ savingOrder ? t('admin.products.savingOrder') : t('admin.products.reorderHint') }}
    </p>
    <AdminProductsProductTable
      :products="filtered"
      :clubs="clubs.items"
      :toggling-ids="togglingIds"
      :toggling-clearance-ids="togglingClearance"
      :duplicating-ids="duplicatingIds"
      :reorderable="reorderable"
      @edit="openEdit"
      @delete="askDelete"
      @toggle-visible="toggleVisible"
      @toggle-clearance="toggleClearanceFlag"
      @preview="openPreview"
      @duplicate="duplicate"
      @reorder="onReorder"
    />
    </template>

    <AdminProductsProductFormModal
      v-model="showForm"
      :product="editing"
      @saved="products.fetchAll()"
    />

    <AdminProductsCategoryManagerModal v-model="showCategories" />

    <AdminProductsCardPreviewModal
      v-model="previewOpen"
      :product="previewing"
    />

    <AdminConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.products.deleteTitle')"
      :message="deleteError || t('admin.products.deleteConfirm', { name: deleting?.name.fr ?? '' })"
      :busy="confirmBusy"
      @confirm="doDelete"
    />
  </div>
</template>
