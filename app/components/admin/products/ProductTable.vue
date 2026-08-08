<script setup lang="ts">
import type { Product } from '~/stores/products'
import type { Club } from '~/stores/clubs'
import { computeUnitPricing } from '~/composables/usePricingPreview'
import { useProductsStore } from '~/stores/products'

interface Props {
  products: Product[]
  clubs: Club[]
  togglingIds?: string[]
  togglingClearanceIds?: string[]
  // * When true, rows are drag-to-reorder (admin product ordering, one club).
  reorderable?: boolean
  duplicatingIds?: string[]
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'edit', p: Product): void
  (e: 'delete', p: Product): void
  (e: 'toggle-visible', p: Product): void
  (e: 'toggle-clearance', p: Product): void
  (e: 'preview', p: Product): void
  (e: 'duplicate', p: Product): void
  // * Emits the products in their new order after a drag-and-drop.
  (e: 'reorder', ordered: Product[]): void
}>()

// * Local ordered snapshot, mutated during drag then committed via `reorder`.
// * Kept in sync with the incoming list so external updates (toggles, refetch)
// * are reflected. DnD only mutates it when `reorderable` is true.
const rows = ref<Product[]>([])
watch(
  () => props.products,
  (next) => {
    rows.value = [...next]
  },
  { immediate: true },
)

const draggingId = ref<string | null>(null)
const overId = ref<string | null>(null)

function onDragStart(id: string) {
  if (!props.reorderable) return
  draggingId.value = id
}
function onDragOver(id: string, e: DragEvent) {
  if (!props.reorderable) return
  e.preventDefault()
  overId.value = id
}
function onDrop(targetId: string) {
  if (!props.reorderable || !draggingId.value || draggingId.value === targetId) {
    draggingId.value = null
    overId.value = null
    return
  }
  const from = rows.value.findIndex((r) => r.id === draggingId.value)
  const to = rows.value.findIndex((r) => r.id === targetId)
  draggingId.value = null
  overId.value = null
  if (from < 0 || to < 0) return
  const moved = rows.value.splice(from, 1)[0]!
  rows.value.splice(to, 0, moved)
  emit('reorder', [...rows.value])
}

const { t } = useI18n()
const client = useSupabaseClient()
const productsStore = useProductsStore()

function bundlesUsing(id: string) {
  return productsStore.bundlesUsing(id)
}

function imageUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function fmt(v: number | string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}

function clubName(id: string) {
  return props.clubs.find((c) => c.id === id)?.name ?? '—'
}

function totalStock(p: Product) {
  return p.variants.reduce((sum, v) => sum + v.stock, 0)
}

function sizesSummary(p: Product) {
  if (p.is_pack) return `${p.bundle_components.length} ×`
  if (!p.variants.length) return '—'
  return p.variants.map((v) => v.size).join(' · ')
}

function fundPerUnit(p: Product) {
  return computeUnitPricing({
    buying_price: Number(p.buying_price),
    selling_price: Number(p.selling_price),
    discount_percent: Number(p.discount_percent),
    discount_source: p.discount_source,
  }).club_fund_per_unit
}
</script>

<template>
  <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
    <div v-if="rows.length === 0" class="p-10 text-center">
      <UIcon name="i-lucide-package" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p class="text-gray-500">{{ t('admin.products.empty') }}</p>
    </div>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <!-- * px-2 between columns (edges keep px-4) so the table fits
                 13" laptops without horizontal scroll. -->
            <th v-if="reorderable" class="px-2 py-3 w-8"></th>
            <th class="pl-4 pr-2 py-3">{{ t('admin.products.col.product') }}</th>
            <th class="px-2 py-3">{{ t('admin.products.col.club') }}</th>
            <th class="px-2 py-3">{{ t('admin.products.col.price') }}</th>
            <th class="px-2 py-3">{{ t('admin.products.col.discount') }}</th>
            <th class="px-2 py-3">{{ t('admin.products.col.margin') }}</th>
            <th class="px-2 py-3">{{ t('admin.products.col.sizes') }}</th>
            <th class="px-2 py-3">{{ t('admin.products.col.flocking') }}</th>
            <th class="px-2 py-3">{{ t('admin.products.col.clearance') }}</th>
            <th class="px-2 py-3">{{ t('admin.products.col.visible') }}</th>
            <th class="pl-2 pr-4 py-3 text-right">{{ t('admin.products.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in rows"
            :key="p.id"
            :draggable="reorderable"
            class="border-t border-gray-100 dark:border-sidebar transition-colors"
            :class="[
              draggingId === p.id ? 'opacity-40' : '',
              overId === p.id ? 'bg-brand-primary/5' : '',
            ]"
            @dragstart="onDragStart(p.id)"
            @dragover="onDragOver(p.id, $event)"
            @drop="onDrop(p.id)"
            @dragend="draggingId = null; overId = null"
          >
            <td v-if="reorderable" class="px-2 py-3 text-gray-400 cursor-grab">
              <UIcon name="i-lucide-grip-vertical" class="w-4 h-4" />
            </td>
            <td class="pl-4 pr-2 py-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden shrink-0">
                  <img v-if="imageUrl(p.images[0]?.image_path)" :src="imageUrl(p.images[0]?.image_path)!" class="w-full h-full object-cover" alt="" />
                  <UIcon v-else name="i-lucide-image" class="w-5 h-5 text-gray-400" />
                </div>
                <div class="min-w-0">
                  <div class="font-medium truncate flex items-center gap-1.5">
                    <span class="truncate">{{ p.name.fr }}</span>
                    <span
                      v-if="p.is_pack"
                      class="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple font-medium"
                      :title="t('admin.products.pack.title')"
                    >
                      <UIcon name="i-lucide-package-2" class="w-3 h-3" />
                      {{ t('admin.products.pack.title') }}
                    </span>
                    <span
                      v-else-if="bundlesUsing(p.id).length > 0"
                      class="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold font-medium"
                      :title="bundlesUsing(p.id).map((b) => b.name.fr).join(', ')"
                    >
                      <UIcon name="i-lucide-lock" class="w-3 h-3" />
                      {{ t('admin.products.bundle.inBundleBadge') }}
                    </span>
                  </div>
                  <div class="text-xs text-gray-500 truncate">{{ p.reference }}</div>
                </div>
              </div>
            </td>
            <td class="px-2 py-3 text-gray-600 dark:text-gray-300">{{ clubName(p.club_id) }}</td>
            <td class="px-2 py-3 font-medium">{{ fmt(p.selling_price) }}</td>
            <td class="px-2 py-3">
              <span v-if="p.discount_percent > 0" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                :class="p.discount_source === 'intersport' ? 'bg-brand-purple/10 text-brand-purple' : 'bg-brand-gold/10 text-brand-gold'"
              >
                {{ p.discount_percent }}% · {{ p.discount_source === 'intersport' ? t('admin.products.discount.intersport') : t('admin.products.discount.club') }}
              </span>
              <span v-else class="text-xs text-gray-400">—</span>
            </td>
            <td class="px-2 py-3">
              <span class="text-brand-green font-medium">{{ fmt(fundPerUnit(p)) }}</span>
            </td>
            <td class="px-2 py-3 text-xs">
              <span class="text-gray-600 dark:text-gray-300">{{ sizesSummary(p) }}</span>
              <div class="text-gray-400">
                {{ t('admin.products.stockTotal', { n: totalStock(p) }) }}
              </div>
            </td>
            <td class="px-2 py-3 text-center">
              <UIcon
                v-if="p.flocking_kind !== 'none'"
                name="i-lucide-shirt"
                :class="['w-4 h-4 mx-auto', p.flocking_kind === 'supporters' ? 'text-brand-secondary' : 'text-brand-primary']"
                :title="p.flocking_kind"
              />
              <span v-else class="text-xs text-gray-400">—</span>
            </td>
            <td class="px-2 py-3">
              <button
                type="button"
                class="p-1.5 rounded-lg"
                :class="p.is_on_clearance ? 'text-brand-secondary hover:bg-brand-secondary/10' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-sidebar'"
                :aria-label="p.is_on_clearance ? t('admin.products.clearance.removeFlag') : t('admin.products.clearance.addFlag')"
                :title="p.is_on_clearance ? t('admin.products.clearance.removeFlag') : t('admin.products.clearance.addFlag')"
                :disabled="togglingClearanceIds?.includes(p.id)"
                @click="$emit('toggle-clearance', p)"
              >
                <UIcon
                  v-if="togglingClearanceIds?.includes(p.id)"
                  name="i-lucide-loader-2"
                  class="w-4 h-4 animate-spin"
                />
                <UIcon v-else :name="p.is_on_clearance ? 'i-lucide-tag' : 'i-lucide-tag'" :class="['w-4 h-4', p.is_on_clearance ? '' : 'opacity-40']" />
              </button>
            </td>
            <td class="px-2 py-3">
              <button
                type="button"
                class="p-1.5 rounded-lg"
                :class="p.is_visible ? 'text-brand-green hover:bg-brand-green/10' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-sidebar'"
                :aria-label="p.is_visible ? t('admin.products.hide') : t('admin.products.show')"
                :disabled="togglingIds?.includes(p.id)"
                @click="$emit('toggle-visible', p)"
              >
                <UIcon
                  v-if="togglingIds?.includes(p.id)"
                  name="i-lucide-loader-2"
                  class="w-4 h-4 animate-spin"
                />
                <UIcon v-else :name="p.is_visible ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="w-4 h-4" />
              </button>
            </td>
            <td class="pl-2 pr-4 py-3">
              <!-- * 2×2 icon grid keeps the actions column narrow. -->
              <div class="grid grid-cols-2 gap-0.5 w-fit ml-auto">
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                :aria-label="t('common.preview')"
                :title="t('common.preview')"
                @click="$emit('preview', p)"
              >
                <UIcon name="i-lucide-monitor" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
                :aria-label="t('common.edit')"
                @click="$emit('edit', p)"
              >
                <UIcon name="i-lucide-pencil" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar disabled:opacity-50"
                :aria-label="t('admin.products.duplicate')"
                :title="t('admin.products.duplicate')"
                :disabled="duplicatingIds?.includes(p.id)"
                @click="$emit('duplicate', p)"
              >
                <UIcon
                  :name="duplicatingIds?.includes(p.id) ? 'i-lucide-loader-2' : 'i-lucide-copy'"
                  :class="['w-4 h-4', duplicatingIds?.includes(p.id) ? 'animate-spin' : '']"
                />
              </button>
              <button
                type="button"
                class="p-1.5 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary"
                :aria-label="t('common.delete')"
                @click="$emit('delete', p)"
              >
                <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
              </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
