<script setup lang="ts">
// * Bundle editor — list of selected component products with axis (primary /
// * secondary) and per-unit quantity. Replaces VariantStockEditor when is_pack.
// * Includes a live availability matrix preview so the seller can see which
// * (primary, secondary) combos are currently buyable.
import type { BundleAxis, Product } from '~/stores/products'
import { useProductsStore } from '~/stores/products'

export interface DraftBundleComponent {
  component_product_id: string
  axis: BundleAxis
  quantity: number
}

interface Props {
  modelValue: DraftBundleComponent[]
  clubId: string
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: DraftBundleComponent[]): void
}>()

const { t } = useI18n()
const products = useProductsStore()
const client = useSupabaseClient()

const pickerOpen = ref(false)

const excludeIds = computed(() => props.modelValue.map((c) => c.component_product_id))

function componentProduct(id: string): Product | null {
  return products.byId(id)
}

function imageUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}

function addComponent(p: Product) {
  const hasPrimary = props.modelValue.some((c) => c.axis === 'primary')
  emit('update:modelValue', [
    ...props.modelValue,
    {
      component_product_id: p.id,
      axis: hasPrimary ? 'secondary' : 'primary',
      quantity: 1,
    },
  ])
}

function removeComponent(i: number) {
  const next = [...props.modelValue]
  next.splice(i, 1)
  emit('update:modelValue', next)
}

function setField<K extends keyof DraftBundleComponent>(
  i: number,
  key: K,
  value: DraftBundleComponent[K],
) {
  const next = props.modelValue.map((c, idx) => (idx === i ? { ...c, [key]: value } : c))
  emit('update:modelValue', next)
}

// * Availability preview — mirrors useBundleAvailability but operates on the
// * in-progress draft (before save).
const preview = computed(() => {
  const pcs = props.modelValue
    .map((c) => ({ c, product: componentProduct(c.component_product_id) }))
    .filter((x): x is { c: DraftBundleComponent; product: Product } => !!x.product)
  if (pcs.length === 0) return null

  const primary = pcs.filter((x) => x.c.axis === 'primary')
  const secondary = pcs.filter((x) => x.c.axis === 'secondary')
  if (primary.length === 0) return null

  const primarySets = primary.map((x) => new Set(x.product.variants.map((v) => v.size)))
  const primarySizes = primarySets.length
    ? Array.from(primarySets[0]!).filter((s) => primarySets.every((set) => set.has(s)))
    : []

  const hasSecondary = secondary.length > 0
  const secondarySets = hasSecondary
    ? secondary.map((x) => new Set(x.product.variants.map((v) => v.size)))
    : []
  const secondarySizes =
    hasSecondary && secondarySets.length
      ? Array.from(secondarySets[0]!).filter((s) =>
          secondarySets.every((set) => set.has(s)),
        )
      : []

  const pairs: Array<[string, string | null]> = hasSecondary
    ? primarySizes.flatMap((p) => secondarySizes.map((s) => [p, s] as [string, string | null]))
    : primarySizes.map((p) => [p, null] as [string, string | null])

  const cells: Array<{ primary: string; secondary: string | null; units: number }> = pairs.map(
    ([p, s]) => {
      let minUnits = Infinity
      let feasible = true
      for (const { c, product } of pcs) {
        const desired = c.axis === 'primary' ? p : s
        if (!desired) {
          feasible = false
          break
        }
        const v = product.variants.find((x) => x.size === desired)
        if (!v) {
          feasible = false
          break
        }
        const units = Math.floor(v.stock / Math.max(1, c.quantity))
        if (units < minUnits) minUnits = units
      }
      return { primary: p, secondary: s, units: feasible && minUnits !== Infinity ? minUnits : 0 }
    },
  )

  return { hasSecondary, primarySizes, secondarySizes, cells }
})

function cellClass(units: number) {
  if (units <= 0) return 'bg-gray-100 text-gray-400 dark:bg-sidebar'
  if (units < 3) return 'bg-brand-gold/15 text-brand-gold'
  return 'bg-brand-green/15 text-brand-green'
}

// * Compute auto buying price so parent can react (just emit a suggestion).
const emitBuying = computed(() =>
  props.modelValue.reduce((sum, c) => {
    const p = componentProduct(c.component_product_id)
    return p ? sum + Number(p.buying_price) * c.quantity : sum
  }, 0),
)
watch(
  emitBuying,
  (v) => emit as any /* no-op typing; parent may expose v:auto-buying-price via prop listener */,
)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <span class="text-sm font-medium">{{ t('admin.products.bundle.componentsTitle') }}</span>
      <button
        type="button"
        class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-brand-primary/40 text-brand-primary text-xs font-medium hover:bg-brand-primary/5"
        @click="pickerOpen = true"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        {{ t('admin.products.bundle.addComponent') }}
      </button>
    </div>

    <div
      v-if="modelValue.length === 0"
      class="p-6 text-center text-sm text-gray-500 border border-dashed border-gray-300 dark:border-sidebar rounded-lg"
    >
      {{ t('admin.products.bundle.empty') }}
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="(c, i) in modelValue"
        :key="c.component_product_id"
        class="flex items-center gap-3 p-2 bg-gray-50 dark:bg-sidebar rounded-lg"
      >
        <div class="w-12 h-12 rounded-lg bg-white dark:bg-sidebar-surface overflow-hidden shrink-0 flex items-center justify-center">
          <img
            v-if="componentProduct(c.component_product_id)?.images?.[0]?.image_path"
            :src="imageUrl(componentProduct(c.component_product_id)!.images[0].image_path)!"
            class="w-full h-full object-cover"
            alt=""
          />
          <UIcon v-else name="i-lucide-image" class="w-5 h-5 text-gray-400" />
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium truncate">
            {{ componentProduct(c.component_product_id)?.name.fr ?? '—' }}
          </div>
          <div class="text-[11px] text-gray-500 truncate">
            {{ componentProduct(c.component_product_id)?.reference }}
          </div>
        </div>
        <label class="text-xs flex items-center gap-1">
          <span class="text-gray-500">{{ t('admin.products.bundle.axis') }}</span>
          <select
            :value="c.axis"
            class="px-2 py-1 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-xs focus:ring-2 focus:ring-brand-primary focus:outline-none"
            @change="setField(i, 'axis', ($event.target as HTMLSelectElement).value as BundleAxis)"
          >
            <option value="primary">{{ t('admin.products.bundle.axisPrimary') }}</option>
            <option value="secondary">{{ t('admin.products.bundle.axisSecondary') }}</option>
          </select>
        </label>
        <label class="text-xs flex items-center gap-1">
          <span class="text-gray-500">{{ t('admin.products.bundle.qty') }}</span>
          <input
            :value="c.quantity"
            type="number"
            min="1"
            step="1"
            class="w-16 px-2 py-1 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-xs focus:ring-2 focus:ring-brand-primary focus:outline-none"
            @input="setField(i, 'quantity', Math.max(1, Math.floor(Number(($event.target as HTMLInputElement).value) || 1)))"
          />
        </label>
        <button
          type="button"
          class="p-1.5 rounded-lg text-brand-secondary hover:bg-brand-secondary/10"
          :aria-label="t('common.delete')"
          @click="removeComponent(i)"
        >
          <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
        </button>
      </li>
    </ul>

    <!-- Availability preview -->
    <div v-if="preview && preview.primarySizes.length > 0" class="border-t border-gray-100 dark:border-sidebar pt-4 space-y-2">
      <h5 class="text-xs uppercase tracking-wider text-gray-500">
        {{ t('admin.products.bundle.availabilityTitle') }}
      </h5>
      <div class="overflow-x-auto">
        <table class="text-xs border-collapse">
          <thead>
            <tr>
              <th class="p-1"></th>
              <th
                v-if="!preview.hasSecondary"
                class="p-1 text-left text-gray-500 font-normal"
              >
                {{ t('admin.products.bundle.stockUnits') }}
              </th>
              <template v-else>
                <th
                  v-for="s in preview.secondarySizes"
                  :key="s"
                  class="p-1 text-center text-gray-500 font-normal"
                >
                  {{ s }}
                </th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in preview.primarySizes" :key="p">
              <td class="p-1 text-gray-500 font-medium pr-3">{{ p }}</td>
              <template v-if="!preview.hasSecondary">
                <td class="p-1">
                  <span
                    class="inline-block min-w-[2rem] text-center px-1.5 py-0.5 rounded font-medium"
                    :class="cellClass(preview.cells.find((c) => c.primary === p)?.units ?? 0)"
                  >
                    {{ preview.cells.find((c) => c.primary === p)?.units ?? 0 }}
                  </span>
                </td>
              </template>
              <template v-else>
                <td v-for="s in preview.secondarySizes" :key="s" class="p-1 text-center">
                  <span
                    class="inline-block min-w-[2rem] text-center px-1.5 py-0.5 rounded font-medium"
                    :class="cellClass(
                      preview.cells.find((c) => c.primary === p && c.secondary === s)?.units ?? 0,
                    )"
                  >
                    {{ preview.cells.find((c) => c.primary === p && c.secondary === s)?.units ?? 0 }}
                  </span>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-gray-500">{{ t('admin.products.bundle.availabilityHint') }}</p>
    </div>

    <AdminProductsProductPickerModal
      v-model="pickerOpen"
      :club-id="clubId"
      :exclude-ids="excludeIds"
      @pick="addComponent"
    />
  </div>
</template>
