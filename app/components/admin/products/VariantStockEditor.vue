<script setup lang="ts">
// * Dynamic size/stock/SKU rows. Packs use `BundleComponentsEditor` instead —
// * this editor is only used for regular (non-pack) products.
import type { FootspotSize } from '~/stores/products'

export interface DraftVariant {
  id?: string
  size: string
  stock: number
  sku: string | null
  footspot_size?: FootspotSize | null
}

interface Props {
  modelValue: DraftVariant[]
  // * When the product carries a footspot_category, each variant gets a
  // *   footspot_size mapping column.
  footspotEnabled?: boolean
}
const props = withDefaults(defineProps<Props>(), { footspotEnabled: false })
const emit = defineEmits<{
  (e: 'update:modelValue', v: DraftVariant[]): void
}>()

const { t } = useI18n()

const FOOTSPOT_SIZES: FootspotSize[] = ['4XS', '3XS', '2XS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']

const gridCols = computed(() =>
  props.footspotEnabled
    ? 'grid-cols-[0.5fr_110px_1fr_130px_32px]'
    : 'grid-cols-[0.5fr_140px_1fr_32px]',
)

function update(next: DraftVariant[]) {
  emit('update:modelValue', next)
}

function addRow() {
  update([...props.modelValue, { size: '', stock: 0, sku: null, footspot_size: null }])
}

function removeRow(i: number) {
  const next = [...props.modelValue]
  next.splice(i, 1)
  update(next)
}

function setField<K extends keyof DraftVariant>(i: number, key: K, value: DraftVariant[K]) {
  const next = props.modelValue.map((v, idx) => (idx === i ? { ...v, [key]: value } : v))
  update(next)
}
</script>

<template>
  <div>
    <span class="text-sm font-medium">{{ t('admin.products.variants.title') }}</span>

    <div
      v-if="modelValue.length === 0"
      class="mt-2 p-4 text-center text-sm text-gray-500 border border-dashed border-gray-300 dark:border-sidebar rounded-lg"
    >
      {{ t('admin.products.variants.empty') }}
    </div>

    <div v-else class="mt-2 space-y-2">
      <div class="grid gap-2 text-xs uppercase tracking-wider text-gray-500 px-1" :class="gridCols">
        <div>{{ t('admin.products.variants.size') }}</div>
        <div>{{ t('admin.products.variants.stock') }}</div>
        <div>{{ t('admin.products.variants.sku') }}</div>
        <div v-if="footspotEnabled">{{ t('admin.products.variants.footspotSize') }}</div>
        <div></div>
      </div>
      <div
        v-for="(v, i) in modelValue"
        :key="v.id ?? `new-${i}`"
        class="grid gap-2 items-center"
        :class="gridCols"
      >
        <input
          :value="v.size"
          type="text"
          class="px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none text-sm"
          :placeholder="t('admin.products.variants.sizePlaceholder')"
          @input="setField(i, 'size', ($event.target as HTMLInputElement).value)"
        />
        <input
          :value="v.stock"
          type="number"
          min="0"
          step="1"
          class="px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none text-sm"
          @input="setField(i, 'stock', Math.max(0, Math.floor(Number(($event.target as HTMLInputElement).value) || 0)))"
        />
        <input
          :value="v.sku ?? ''"
          type="text"
          class="px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none text-sm"
          :placeholder="t('admin.products.variants.skuPlaceholder')"
          @input="setField(i, 'sku', ($event.target as HTMLInputElement).value || null)"
        />
        <select
          v-if="footspotEnabled"
          :value="v.footspot_size ?? ''"
          class="px-2 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none text-sm"
          @change="setField(i, 'footspot_size', (($event.target as HTMLSelectElement).value || null) as FootspotSize | null)"
        >
          <option value="">{{ t('admin.products.variants.footspotNotSynced') }}</option>
          <option v-for="s in FOOTSPOT_SIZES" :key="s" :value="s">{{ s }}</option>
        </select>
        <button
          type="button"
          class="p-2 rounded-lg text-brand-secondary hover:bg-brand-secondary/10 justify-self-end"
          :aria-label="t('common.delete')"
          @click="removeRow(i)"
        >
          <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <button
      type="button"
      class="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-brand-primary/40 text-brand-primary text-sm font-medium hover:bg-brand-primary/5 transition-colors"
      @click="addRow"
    >
      <UIcon name="i-lucide-plus" class="w-4 h-4" />
      <span>{{ t('admin.products.variants.add') }}</span>
    </button>
  </div>
</template>
