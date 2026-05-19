<script setup lang="ts">
// * Searchable vertical-card grid for picking a component product for a bundle.
// * Scoped to the bundle's club. Exclusions: bundles themselves (no nesting)
// * and ids passed via `excludeIds` (already-added components).
import type { Product } from '~/stores/products'
import { useProductsStore } from '~/stores/products'

interface Props {
  modelValue: boolean
  clubId: string
  excludeIds?: string[]
}
const props = withDefaults(defineProps<Props>(), { excludeIds: () => [] })
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'pick', product: Product): void
}>()

const { t } = useI18n()
const products = useProductsStore()
const client = useSupabaseClient()

const search = ref('')

const candidates = computed<Product[]>(() => {
  const q = search.value.trim().toLowerCase()
  return products.items.filter((p) => {
    if (p.club_id !== props.clubId) return false
    if (p.is_pack) return false
    if (props.excludeIds.includes(p.id)) return false
    if (!q) return true
    return (
      p.name.fr.toLowerCase().includes(q) ||
      p.name.en.toLowerCase().includes(q) ||
      p.reference.toLowerCase().includes(q) ||
      (p.category ?? '').toLowerCase().includes(q)
    )
  })
})

function totalStock(p: Product) {
  return p.variants.reduce((n, v) => n + v.stock, 0)
}

function inBundlesCount(p: Product) {
  return products.bundlesUsing(p.id).length
}

function imageUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function close() {
  emit('update:modelValue', false)
}

function pick(p: Product) {
  emit('pick', p)
  close()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) search.value = ''
  },
)
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
    @click.self="close"
  >
    <div class="w-full max-w-4xl my-8 bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-5 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-heading text-lg font-bold">{{ t('admin.products.picker.title') }}</h3>
        <button
          type="button"
          class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar"
          :aria-label="t('common.cancel')"
          @click="close"
        >
          <UIcon name="i-lucide-x" class="w-5 h-5" />
        </button>
      </div>

      <div class="relative">
        <UIcon name="i-lucide-search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          v-model="search"
          type="text"
          :placeholder="t('admin.products.picker.searchPlaceholder')"
          class="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
      </div>

      <div v-if="candidates.length === 0" class="py-12 text-center text-sm text-gray-500">
        {{ t('admin.products.picker.empty') }}
      </div>

      <div
        v-else
        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto pr-1"
      >
        <button
          v-for="p in candidates"
          :key="p.id"
          type="button"
          class="group text-left bg-white dark:bg-sidebar rounded-card border border-gray-200 dark:border-sidebar hover:border-brand-primary hover:shadow-card-sm transition-all overflow-hidden flex flex-col"
          @click="pick(p)"
        >
          <div class="aspect-square bg-gray-100 dark:bg-sidebar-surface overflow-hidden">
            <img
              v-if="imageUrl(p.images[0]?.image_path)"
              :src="imageUrl(p.images[0]?.image_path)!"
              :alt="p.name.fr"
              class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-lucide-image" class="w-8 h-8 text-gray-300" />
            </div>
          </div>
          <div class="p-3 space-y-1 flex-1 flex flex-col">
            <div class="text-sm font-medium line-clamp-2">{{ p.name.fr }}</div>
            <div class="text-[11px] text-gray-500 truncate">{{ p.reference }}</div>
            <div class="flex items-center justify-between mt-auto pt-1">
              <span class="text-[11px] text-gray-500">
                {{ t('admin.products.picker.stock', { n: totalStock(p) }) }}
              </span>
              <span
                v-if="inBundlesCount(p) > 0"
                class="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold font-medium"
              >
                {{ t('admin.products.picker.inBundles', { n: inBundlesCount(p) }) }}
              </span>
            </div>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
