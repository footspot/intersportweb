<script setup lang="ts">
// * Color-grouped variant editor. Color is the organizing unit: each color is a
// * card that owns its own images and its own size/stock/SKU rows. Because every
// * image and size is created *inside* a color card, the color is implied by
// * context and can never be left unassigned — no per-image/per-row color
// * dropdowns, no orphaned photos or SKUs.
// *
// * A product can also have no colors at all: then a single plain card holds the
// * shared gallery + sizes (color_key stays null), with a CTA to split by color.
// *
// * This component never changes the payload shape — it still drives the flat
// * `colors[] / images[] / variants[]` model the edge function expects, just
// * reorganized in the UI.
import type { DraftColor } from './ProductColorsEditor.vue'
import type { GallerySlot } from './GalleryEditor.vue'
import type { DraftVariant } from './VariantStockEditor.vue'

interface Props {
  colors: DraftColor[]
  images: GallerySlot[]
  variants: DraftVariant[]
  // * Adds a Footspot-size mapping column to each size row when set.
  footspotEnabled?: boolean
  // * Selected club's logo, threaded to the per-image overlay editor.
  clubLogoUrl?: string | null
  bucket?: string
}
const props = withDefaults(defineProps<Props>(), {
  footspotEnabled: false,
  clubLogoUrl: null,
  bucket: 'product-images',
})
const emit = defineEmits<{
  (e: 'update:colors', v: DraftColor[]): void
  (e: 'update:images', v: GallerySlot[]): void
  (e: 'update:variants', v: DraftVariant[]): void
}>()

const { t } = useI18n()

const hasColors = computed(() => props.colors.length > 0)

// * Images tied to no color (legacy "all colors" photos). We only surface a zone
// * for them when some already exist, so new color-mode products keep every
// * photo inside a color instead of accumulating orphans.
const generalImages = computed(() => props.images.filter((s) => !s.color_key))

function imagesForColor(key: string) {
  return props.images.filter((s) => s.color_key === key)
}
function variantsForColor(key: string) {
  return props.variants.filter((v) => v.color_key === key)
}

// * Rebuild the flat image list from a freshly edited subset: general photos
// * first, then every color's subset in color order. The edited subset is
// * stamped with its color (null for the general bucket) and swapped in.
function rebuildImages(colorKey: string | null, subset: GallerySlot[]): GallerySlot[] {
  const stamped = subset.map((s) => ({ ...s, color_key: colorKey }))
  const general = colorKey === null ? stamped : generalImages.value
  const perColor = props.colors.flatMap((c) =>
    c.key === colorKey ? stamped : imagesForColor(c.key),
  )
  return [...general, ...perColor]
}

function onColorImages(colorKey: string, subset: GallerySlot[]) {
  emit('update:images', rebuildImages(colorKey, subset))
}
function onGeneralImages(subset: GallerySlot[]) {
  emit('update:images', rebuildImages(null, subset))
}

function rebuildVariants(colorKey: string, subset: DraftVariant[]): DraftVariant[] {
  const stamped = subset.map((v) => ({ ...v, color_key: colorKey }))
  return props.colors.flatMap((c) =>
    c.key === colorKey ? stamped : variantsForColor(c.key),
  )
}
function onColorVariants(colorKey: string, subset: DraftVariant[]) {
  emit('update:variants', rebuildVariants(colorKey, subset))
}

// * No-color mode passes the whole arrays straight through (everything null).
function onPlainImages(v: GallerySlot[]) {
  emit('update:images', v)
}
function onPlainVariants(v: DraftVariant[]) {
  emit('update:variants', v)
}

function setColorField<K extends keyof DraftColor>(key: string, field: K, value: DraftColor[K]) {
  emit('update:colors', props.colors.map((c) => (c.key === key ? { ...c, [field]: value } : c)))
}

function addColor() {
  const key = crypto.randomUUID()
  if (!hasColors.value) {
    // * First color: migrate every existing colorless image/size into it so the
    // * switch to color mode leaves nothing behind.
    emit('update:images', props.images.map((s) => ({ ...s, color_key: key })))
    emit('update:variants', props.variants.map((v) => ({ ...v, color_key: key })))
  }
  emit('update:colors', [...props.colors, { key, name: '', hex: '#000000' }])
}

function removeColor(key: string) {
  // * Drop the color together with its images and size rows — its stock leaves
  // * with it. Other colors keep theirs.
  emit('update:images', props.images.filter((s) => s.color_key !== key))
  emit('update:variants', props.variants.filter((v) => v.color_key !== key))
  emit('update:colors', props.colors.filter((c) => c.key !== key))
}

// * Copy one color's size list onto every other color. `withStock` carries the
// * source stock too; otherwise new rows start at 0. Existing matching rows on
// * the other colors are kept — except with `withStock`, where their stock is
// * refreshed to the source value (so running "copy sizes" then "copy sizes +
// * stock" actually fills the zeros instead of no-op'ing on the existing combos).
function copyToOthers(sourceKey: string, withStock: boolean) {
  // * size -> stock from the source color (last wins on duplicate sizes).
  const stockBySize = new Map(
    variantsForColor(sourceKey)
      .filter((v) => v.size.trim())
      .map((v) => [v.size.trim(), v.stock] as const),
  )
  if (stockBySize.size === 0) return

  let changed = false
  const present = new Set<string>()
  const updated = props.variants.map((v) => {
    present.add(`${v.color_key}::${v.size.trim()}`)
    if (withStock && v.color_key && v.color_key !== sourceKey) {
      const src = stockBySize.get(v.size.trim())
      if (src != null && src !== v.stock) {
        changed = true
        return { ...v, stock: src }
      }
    }
    return v
  })

  const additions: DraftVariant[] = []
  for (const c of props.colors) {
    if (c.key === sourceKey) continue
    for (const [size, stock] of stockBySize) {
      if (present.has(`${c.key}::${size}`)) continue
      additions.push({
        size,
        stock: withStock ? stock : 0,
        sku: null,
        footspot_size: null,
        color_key: c.key,
      })
    }
  }
  if (additions.length) changed = true

  if (changed) emit('update:variants', [...updated, ...additions])
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h4 class="font-heading font-bold">{{ t('admin.products.colorVariants.title') }}</h4>
        <p class="text-xs text-gray-500">{{ t('admin.products.colorVariants.hint') }}</p>
      </div>
      <button
        v-if="hasColors"
        type="button"
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-brand-primary text-brand-primary hover:bg-brand-primary/5 shrink-0"
        @click="addColor"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        {{ t('admin.products.colorVariants.addColor') }}
      </button>
    </div>

    <!-- * No-color mode: a single plain card (shared gallery + sizes). -->
    <div
      v-if="!hasColors"
      class="rounded-xl border border-gray-200 dark:border-sidebar p-4 space-y-4"
    >
      <AdminProductsGalleryEditor
        :model-value="images"
        :bucket="bucket"
        :label="t('admin.products.image')"
        :club-logo-url="clubLogoUrl"
        :colors="[]"
        @update:model-value="onPlainImages"
      />
      <AdminProductsVariantStockEditor
        :model-value="variants"
        :footspot-enabled="footspotEnabled"
        :colors="[]"
        @update:model-value="onPlainVariants"
      />
      <button
        type="button"
        class="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-brand-primary/40 text-brand-primary text-sm font-medium hover:bg-brand-primary/5 transition-colors"
        @click="addColor"
      >
        <UIcon name="i-lucide-palette" class="w-4 h-4" />
        {{ t('admin.products.colorVariants.addColorsCta') }}
      </button>
    </div>

    <!-- * Color mode: one card per color, each with its own images + sizes. -->
    <template v-else>
      <!-- * Legacy "all colors" photos — shown only when some already exist. -->
      <div
        v-if="generalImages.length"
        class="rounded-xl border border-dashed border-gray-300 dark:border-sidebar p-4 space-y-2"
      >
        <div>
          <p class="text-sm font-medium">{{ t('admin.products.colorVariants.generalImages') }}</p>
          <p class="text-xs text-gray-500">{{ t('admin.products.colorVariants.generalImagesHint') }}</p>
        </div>
        <AdminProductsGalleryEditor
          :model-value="generalImages"
          :bucket="bucket"
          :club-logo-url="clubLogoUrl"
          :colors="[]"
          @update:model-value="onGeneralImages"
        />
      </div>

      <div
        v-for="c in colors"
        :key="c.key"
        class="rounded-xl border border-gray-200 dark:border-sidebar p-4 space-y-4"
      >
        <!-- * Images first, then the colour picker directly below them. The
             native colour dialog opens downward (over the sizes area), so the
             product photo above stays visible while staff match the hex to it. -->
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium">{{ t('admin.products.colorVariants.colorImages') }}</p>
          <button
            type="button"
            class="p-1.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-brand-secondary/5 shrink-0"
            :title="t('common.delete')"
            @click="removeColor(c.key)"
          >
            <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
          </button>
        </div>
        <AdminProductsGalleryEditor
          :model-value="imagesForColor(c.key)"
          :bucket="bucket"
          :club-logo-url="clubLogoUrl"
          :colors="[]"
          @update:model-value="(v: GallerySlot[]) => onColorImages(c.key, v)"
        />

        <!-- * Colour swatch + name, placed under the photos so the picker dialog
             never covers them. -->
        <div class="flex items-center gap-3">
          <input
            :value="c.hex"
            type="color"
            :title="t('admin.products.colors.swatch')"
            class="h-9 w-11 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent cursor-pointer shrink-0"
            @input="setColorField(c.key, 'hex', ($event.target as HTMLInputElement).value)"
          />
          <input
            :value="c.name"
            type="text"
            :placeholder="t('admin.products.colors.namePlaceholder')"
            class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent font-medium focus:ring-2 focus:ring-brand-primary focus:outline-none"
            @input="setColorField(c.key, 'name', ($event.target as HTMLInputElement).value)"
          />
        </div>

        <!-- * Sizes / stock / SKU for this color (no color column — it's the card). -->
        <AdminProductsVariantStockEditor
          :model-value="variantsForColor(c.key)"
          :footspot-enabled="footspotEnabled"
          :colors="[]"
          @update:model-value="(v: DraftVariant[]) => onColorVariants(c.key, v)"
        />

        <div
          v-if="colors.length > 1 && variantsForColor(c.key).some((v) => v.size.trim())"
          class="flex flex-wrap gap-2"
        >
          <button
            type="button"
            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-sidebar text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-sidebar transition-colors"
            @click="copyToOthers(c.key, false)"
          >
            <UIcon name="i-lucide-copy" class="w-4 h-4" />
            {{ t('admin.products.colorVariants.copyToColors') }}
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-sidebar text-gray-600 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-sidebar transition-colors"
            @click="copyToOthers(c.key, true)"
          >
            <UIcon name="i-lucide-copy-plus" class="w-4 h-4" />
            {{ t('admin.products.colorVariants.copyStockToColors') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
