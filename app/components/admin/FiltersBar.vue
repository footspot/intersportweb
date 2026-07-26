<script setup lang="ts">
import type { Club } from '~/stores/clubs'
import type { Product } from '~/stores/products'

// * Shared back-office filter bar (stats + orders). `all` is opt-in via the
// * `periods` prop — stats always works on a bounded window, orders defaults
// * to the full list.
export type Period = 'all' | '7d' | '30d' | '90d' | '12m' | 'custom'

interface Props {
  period: Period
  // * Which period buttons to render. Defaults to the stats set.
  periods?: Period[]
  // * Custom range bounds ('YYYY-MM-DD'), used when period === 'custom'.
  dateFrom: string
  dateTo: string
  clubId: string | null
  category: string | null
  productId: string | null
  size: string | null
  reference: string
  clubs: Club[]
  categories: string[]
  products: Product[]
  availableSizes: string[]
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:period', v: Period): void
  (e: 'update:dateFrom', v: string): void
  (e: 'update:dateTo', v: string): void
  (e: 'update:clubId', v: string | null): void
  (e: 'update:category', v: string | null): void
  (e: 'update:productId', v: string | null): void
  (e: 'update:size', v: string | null): void
  (e: 'update:reference', v: string): void
}>()

const { t, locale } = useI18n()
const periods = computed<Period[]>(() => props.periods ?? ['7d', '30d', '90d', '12m', 'custom'])

// * Today in local time, for the date inputs' max attribute.
const today = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

// * Searchable product picker — input + dropdown.
const productQuery = ref('')
const productOpen = ref(false)
const pickerEl = ref<HTMLElement | null>(null)

const selectedProduct = computed(() =>
  props.products.find((p) => p.id === props.productId) ?? null,
)

watch(
  selectedProduct,
  (p) => {
    productQuery.value = p ? productLabel(p) : ''
  },
  { immediate: true },
)

function productLabel(p: Product): string {
  const name = p.name?.[locale.value as 'fr' | 'en'] ?? p.name?.fr ?? ''
  return `${name} — ${p.reference}`
}

const filteredProducts = computed(() => {
  // * Scope to the selected club when one is chosen, else show all.
  const scoped = props.clubId
    ? props.products.filter((p) => p.club_id === props.clubId)
    : props.products
  const q = productQuery.value.trim().toLowerCase()
  if (!q || (selectedProduct.value && q === productLabel(selectedProduct.value).toLowerCase())) {
    return scoped.slice(0, 50)
  }
  return scoped
    .filter((p) => productLabel(p).toLowerCase().includes(q))
    .slice(0, 50)
})

function pickProduct(p: Product) {
  emit('update:productId', p.id)
  productQuery.value = productLabel(p)
  productOpen.value = false
}

function clearProduct() {
  emit('update:productId', null)
  productQuery.value = ''
}

function onProductInput(e: Event) {
  productQuery.value = (e.target as HTMLInputElement).value
  productOpen.value = true
  // * If the user clears the field, drop the selection too.
  if (!productQuery.value.trim() && props.productId) emit('update:productId', null)
}

function onClickOutside(e: MouseEvent) {
  if (!pickerEl.value) return
  if (!pickerEl.value.contains(e.target as Node)) productOpen.value = false
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<template>
  <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4 flex flex-wrap items-end gap-3">
    <div>
      <span class="text-xs uppercase tracking-wider text-gray-500 block mb-1">{{ t('admin.filters.period') }}</span>
      <div class="flex gap-1">
        <button
          v-for="p in periods"
          :key="p"
          type="button"
          class="px-3 py-1.5 rounded-lg text-xs font-medium"
          :class="props.period === p ? 'bg-brand-primary text-white' : 'bg-gray-100 dark:bg-sidebar text-gray-700 dark:text-gray-300'"
          @click="emit('update:period', p)"
        >
          {{ t(`admin.filters.${p}`) }}
        </button>
      </div>
    </div>

    <!-- * Custom range pickers — only when the custom period is active -->
    <template v-if="props.period === 'custom'">
      <div>
        <span class="text-xs uppercase tracking-wider text-gray-500 block mb-1">{{ t('admin.filters.from') }}</span>
        <input
          :value="props.dateFrom"
          type="date"
          :max="props.dateTo || today"
          class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
          @change="emit('update:dateFrom', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div>
        <span class="text-xs uppercase tracking-wider text-gray-500 block mb-1">{{ t('admin.filters.to') }}</span>
        <input
          :value="props.dateTo"
          type="date"
          :min="props.dateFrom || undefined"
          :max="today"
          class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
          @change="emit('update:dateTo', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </template>

    <div class="min-w-40">
      <span class="text-xs uppercase tracking-wider text-gray-500 block mb-1">{{ t('admin.filters.club') }}</span>
      <select
        :value="props.clubId ?? ''"
        class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @change="emit('update:clubId', ($event.target as HTMLSelectElement).value || null)"
      >
        <option value="">{{ t('admin.filters.allClubs') }}</option>
        <option v-for="c in props.clubs" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>

    <div class="min-w-40">
      <span class="text-xs uppercase tracking-wider text-gray-500 block mb-1">{{ t('admin.filters.category') }}</span>
      <select
        :value="props.category ?? ''"
        class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @change="emit('update:category', ($event.target as HTMLSelectElement).value || null)"
      >
        <option value="">{{ t('admin.filters.allCategories') }}</option>
        <option v-for="c in props.categories" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>

    <div ref="pickerEl" class="relative min-w-56">
      <span class="text-xs uppercase tracking-wider text-gray-500 block mb-1">{{ t('admin.filters.product') }}</span>
      <div class="relative">
        <input
          :value="productQuery"
          type="text"
          :placeholder="t('admin.filters.productPlaceholder')"
          class="w-full pl-3 pr-8 py-1.5 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
          @input="onProductInput"
          @focus="productOpen = true"
        />
        <button
          v-if="props.productId"
          type="button"
          class="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-brand-secondary"
          :aria-label="t('admin.filters.clearProduct')"
          @click="clearProduct"
        >
          <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
        </button>
      </div>
      <ul
        v-if="productOpen && filteredProducts.length"
        class="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-sidebar-surface border border-gray-200 dark:border-sidebar rounded-lg shadow-card-sm text-sm"
      >
        <li
          v-for="p in filteredProducts"
          :key="p.id"
          class="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-sidebar cursor-pointer truncate"
          @mousedown.prevent="pickProduct(p)"
        >
          {{ productLabel(p) }}
        </li>
      </ul>
    </div>

    <div class="min-w-32">
      <span class="text-xs uppercase tracking-wider text-gray-500 block mb-1">{{ t('admin.filters.size') }}</span>
      <select
        :value="props.size ?? ''"
        class="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @change="emit('update:size', ($event.target as HTMLSelectElement).value || null)"
      >
        <option value="">{{ t('admin.filters.allSizes') }}</option>
        <option v-for="s in props.availableSizes" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <div class="flex-1 min-w-48">
      <span class="text-xs uppercase tracking-wider text-gray-500 block mb-1">{{ t('admin.filters.reference') }}</span>
      <input
        :value="props.reference"
        type="text"
        :placeholder="t('admin.filters.referencePlaceholder')"
        class="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-sidebar bg-transparent text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @input="emit('update:reference', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- * Page-specific trailing actions (e.g. the orders export button) -->
    <slot />
  </div>
</template>
