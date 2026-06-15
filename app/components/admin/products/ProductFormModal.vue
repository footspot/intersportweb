<script setup lang="ts">
import { useProductsStore, type FlockingKind, type ImageSlot, type Product, type ProductPayload } from '~/stores/products'

// * Draft row for the dynamic paid-options editor (name + price + optional
// * customer input). No id is threaded back: the whole set is replaced on save.
interface DraftOption {
  name: string
  price: number
  // * When true, customers see an optional free-text field (e.g. jersey number).
  allow_custom_input: boolean
  input_label: string
}
import { useClubsStore } from '~/stores/clubs'
import type { DiscountSource } from '~/composables/usePricingPreview'
import type { DraftVariant } from './VariantStockEditor.vue'
import type { DraftBundleComponent } from './BundleComponentsEditor.vue'
import type { GallerySlot } from './GalleryEditor.vue'
import type { DraftColor } from './ProductColorsEditor.vue'

interface Props {
  modelValue: boolean
  product: Product | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const products = useProductsStore()
const clubs = useClubsStore()
const supabase = useSupabaseClient()

// * Public URL of the selected club's logo (club-logos bucket), fed to the
// * image overlay editor so staff can stamp the crest onto a product photo.
const selectedClubLogoUrl = computed(() => {
  const club = clubs.byId(clubId.value)
  if (!club?.logo_path) return null
  const { data } = supabase.storage.from('club-logos').getPublicUrl(club.logo_path)
  return data?.publicUrl ?? null
})

const clubId = ref('')
const name = ref('')
const reference = ref('')
const category = ref('')
const detailsFr = ref('')
const detailsEn = ref('')
const gallerySlots = ref<GallerySlot[]>([])
const buyingPrice = ref(0)
const sellingPrice = ref(0)
const discountPercent = ref(0)
const discountSource = ref<DiscountSource>(null)
const flockingKind = ref<FlockingKind>('none')
const flockingMembersNamePrice = ref(0)
const flockingMembersInitialsPrice = ref(0)
const flockingSupporterPrice = ref(0)
const isPack = ref(false)
const isVisible = ref(true)
const isOnClearance = ref(false)
const weightGrams = ref(0)
const availableFrom = ref<string>('')
const footspotCategory = ref<string>('')
const variants = ref<DraftVariant[]>([])
const options = ref<DraftOption[]>([])
const colors = ref<DraftColor[]>([])

const FOOTSPOT_CATEGORIES = [
  'jersey', 'shorts', 'socks', 'ball', 'cone', 'bib',
  'goalkeeper_gloves', 'training_vest', 'other',
] as const
const bundleComponents = ref<DraftBundleComponent[]>([])

const saving = ref(false)
const errorMsg = ref<string | null>(null)

const isEdit = computed(() => !!props.product)

// * If we are editing a product that's currently used as a component of
// * another bundle, show a locked banner so the seller knows it's hidden from
// * customers.
const lockedInBundles = computed(() => {
  if (!props.product) return []
  return products.bundlesUsing(props.product.id)
})

// * Suggestions for the free-text category input — deduplicated across all
// * clubs, since the same category string is intentionally shared (the
// * storefront filter buckets by exact string match). Helps avoid duplicates
// * from typos like "maillot" vs "Maillot".
const knownCategories = computed(() =>
  Array.from(
    new Set(products.items.map((p) => p.category).filter(Boolean) as string[]),
  ).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
)

const pricingInput = computed(() => ({
  buying_price: Number(buyingPrice.value) || 0,
  selling_price: Number(sellingPrice.value) || 0,
  discount_percent: Number(discountPercent.value) || 0,
  discount_source: discountSource.value,
}))

// * Auto-computed bundle buying price from component buying prices × quantities.
const autoBundleBuyingPrice = computed(() => {
  if (!isPack.value) return null
  return bundleComponents.value.reduce((sum, c) => {
    const p = products.byId(c.component_product_id)
    return p ? sum + Number(p.buying_price) * c.quantity : sum
  }, 0)
})

// * Whenever the components or their underlying prices change, keep bundle's
// * own buying_price in sync (sum of components × qty). The seller can still
// * override it manually afterwards.
watch(autoBundleBuyingPrice, (v) => {
  if (v != null) buyingPrice.value = Number(v.toFixed(2))
})

// * When colors change, drop any variant/image references to a color that no
// * longer exists. Variants fall back to the first remaining color (or null
// * when none left); images fall back to "all colors" (null).
watch(
  () => colors.value.map((c) => c.key),
  (keys) => {
    const valid = new Set(keys)
    const fallback = keys[0] ?? null
    variants.value = variants.value.map((v) =>
      v.color_key && !valid.has(v.color_key) ? { ...v, color_key: fallback } : v,
    )
    gallerySlots.value = gallerySlots.value.map((s) =>
      s.color_key && !valid.has(s.color_key) ? { ...s, color_key: null } : s,
    )
  },
)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const p = props.product
    clubId.value = p?.club_id ?? (clubs.items[0]?.id ?? '')
    name.value = p?.name.fr ?? ''
    reference.value = p?.reference ?? ''
    category.value = p?.category ?? ''
    detailsFr.value = p?.details?.fr ?? ''
    detailsEn.value = p?.details?.en ?? ''
    // * Existing colors use their DB id as the client `key`, so variants and
    // * images can reference them by the same value they carry in color_id.
    colors.value = (p?.colors ?? []).map((c) => ({ id: c.id, key: c.id, name: c.name, hex: c.hex }))
    gallerySlots.value =
      p?.images?.map((img) => ({ id: img.id, existing: img.image_path, color_key: img.color_id })) ?? []
    buyingPrice.value = Number(p?.buying_price ?? 0)
    sellingPrice.value = Number(p?.selling_price ?? 0)
    discountPercent.value = Number(p?.discount_percent ?? 0)
    discountSource.value = (p?.discount_source ?? null) as DiscountSource
    flockingKind.value = p?.flocking_kind ?? 'none'
    flockingMembersNamePrice.value = Number(p?.flocking_members_name_price ?? 0)
    flockingMembersInitialsPrice.value = Number(p?.flocking_members_initials_price ?? 0)
    flockingSupporterPrice.value = Number(p?.flocking_supporter_price ?? 0)
    isPack.value = !!p?.is_pack
    isVisible.value = p?.is_visible ?? true
    isOnClearance.value = !!p?.is_on_clearance
    weightGrams.value = Number(p?.weight_grams ?? 0)
    availableFrom.value = p?.available_from ?? ''
    footspotCategory.value = p?.footspot_category ?? ''
    variants.value = p?.variants?.length
      ? p.variants.map((v) => ({ id: v.id, size: v.size, stock: v.stock, sku: v.sku, footspot_size: v.footspot_size, color_key: v.color_id }))
      : [{ size: '', stock: 0, sku: null, footspot_size: null, color_key: null }]
    options.value = (p?.options ?? []).map((o) => ({
      name: o.name,
      price: Number(o.price),
      allow_custom_input: !!o.allow_custom_input,
      input_label: o.input_label ?? '',
    }))
    bundleComponents.value = (p?.bundle_components ?? []).map((bc) => ({
      component_product_id: bc.component_product_id,
      axis: bc.axis,
      quantity: bc.quantity,
    }))
    errorMsg.value = null
  },
  { immediate: true },
)

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

function addOption() {
  options.value.push({ name: '', price: 0, allow_custom_input: false, input_label: '' })
}

function removeOption(index: number) {
  options.value.splice(index, 1)
}

async function save() {
  errorMsg.value = null
  if (!clubId.value) {
    errorMsg.value = t('admin.products.errors.clubRequired')
    return
  }
  if (!name.value.trim()) {
    errorMsg.value = t('admin.products.errors.nameRequired')
    return
  }
  if (!reference.value.trim()) {
    errorMsg.value = t('admin.products.errors.referenceRequired')
    return
  }
  if (Number(sellingPrice.value) < Number(buyingPrice.value)) {
    errorMsg.value = t('admin.products.errors.sellingBelowBuying')
    return
  }
  if (discountPercent.value > 0 && !discountSource.value) {
    errorMsg.value = t('admin.products.errors.discountSourceRequired')
    return
  }
  if (options.value.some((o) => !o.name.trim())) {
    errorMsg.value = t('admin.products.errors.optionNameRequired')
    return
  }
  if (isPack.value) {
    if (bundleComponents.value.length === 0) {
      errorMsg.value = t('admin.products.errors.bundleEmpty')
      return
    }
    if (!bundleComponents.value.some((c) => c.axis === 'primary')) {
      errorMsg.value = t('admin.products.errors.bundleNeedsPrimary')
      return
    }
  } else {
    if (variants.value.length === 0 || variants.value.some((v) => !v.size.trim())) {
      errorMsg.value = t('admin.products.errors.variantRequired')
      return
    }
    if (colors.value.some((c) => !c.name.trim())) {
      errorMsg.value = t('admin.products.errors.colorNameRequired')
      return
    }
    // * When colors are defined, every size row must belong to one.
    if (colors.value.length > 0 && variants.value.some((v) => !v.color_key)) {
      errorMsg.value = t('admin.products.errors.variantColorRequired')
      return
    }
  }

  saving.value = true
  try {
    const trimmedName = name.value.trim()
    // * Build image slots + attach new files under stable keys (imageFile_<slot.id>).
    const imageSlots: ImageSlot[] = []
    const files: Record<string, File> = {}
    for (const s of gallerySlots.value) {
      if (s.file) {
        const key = `imageFile_${s.id}`
        files[key] = s.file
        imageSlots.push({ file_key: key, color_key: s.color_key ?? null })
      } else if (s.existing) {
        imageSlots.push({ existing: s.existing, color_key: s.color_key ?? null })
      }
    }

    const basePayload: ProductPayload = {
      club_id: clubId.value,
      name: { fr: trimmedName, en: trimmedName },
      reference: reference.value.trim(),
      details:
        detailsFr.value.trim() || detailsEn.value.trim()
          ? { fr: detailsFr.value.trim() || undefined, en: detailsEn.value.trim() || undefined }
          : null,
      image_slots: imageSlots,
      category: category.value.trim() || null,
      buying_price: Number(buyingPrice.value),
      selling_price: Number(sellingPrice.value),
      discount_percent: Number(discountPercent.value) || 0,
      discount_source: discountPercent.value > 0 ? discountSource.value : null,
      flocking_kind: flockingKind.value,
      flocking_members_name_price: flockingKind.value === 'members' ? Math.max(0, Number(flockingMembersNamePrice.value) || 0) : 0,
      flocking_members_initials_price: flockingKind.value === 'members' ? Math.max(0, Number(flockingMembersInitialsPrice.value) || 0) : 0,
      flocking_supporter_price: flockingKind.value === 'supporters' ? Math.max(0, Number(flockingSupporterPrice.value) || 0) : 0,
      is_pack: isPack.value,
      is_visible: isVisible.value,
      is_on_clearance: isOnClearance.value,
      weight_grams: Math.max(0, Math.floor(Number(weightGrams.value) || 0)),
      available_from: availableFrom.value.trim() || null,
      footspot_category: (footspotCategory.value.trim() || null) as ProductPayload['footspot_category'],
      sort_order: props.product?.sort_order ?? 0,
      options: options.value.map((o) => ({
        name: o.name.trim(),
        price: Math.max(0, Number(o.price) || 0),
        allow_custom_input: o.allow_custom_input,
        input_label: o.allow_custom_input ? (o.input_label.trim() || null) : null,
      })),
      // * Colors only ride along for regular products; packs carry none.
      colors: isPack.value
        ? []
        : colors.value.map((c) => ({ id: c.id, key: c.key, name: c.name.trim(), hex: c.hex })),
    }

    const payload: ProductPayload = isPack.value
      ? {
          ...basePayload,
          components: bundleComponents.value.map((c) => ({
            component_product_id: c.component_product_id,
            axis: c.axis,
            quantity: c.quantity,
          })),
        }
      : {
          ...basePayload,
          variants: variants.value.map((v) => ({
            id: v.id,
            size: v.size.trim(),
            stock: v.stock,
            sku: v.sku,
            footspot_size: v.footspot_size ?? null,
            color_key: v.color_key ?? null,
          })),
        }

    if (props.product) {
      await products.update({ ...payload, id: props.product.id }, files)
    } else {
      await products.create(payload, files)
    }

    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
  >
    <div class="w-full max-w-3xl my-8 bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-5">
      <div class="flex items-center justify-between">
        <h3 class="font-heading text-xl font-bold">
          {{ isEdit ? t('admin.products.edit') : t('admin.products.new') }}
        </h3>
        <label class="inline-flex items-center gap-2 text-sm">
          <input v-model="isVisible" type="checkbox" class="w-4 h-4 accent-brand-primary" />
          <span>{{ t('admin.products.visible') }}</span>
        </label>
      </div>

      <div
        v-if="lockedInBundles.length > 0"
        class="rounded-lg bg-brand-gold/10 border border-brand-gold/30 text-brand-gold text-sm p-3 flex items-start gap-2"
      >
        <UIcon name="i-lucide-lock" class="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <div class="font-medium">{{ t('admin.products.bundle.lockedBanner') }}</div>
          <div class="text-xs opacity-80">
            {{ t('admin.products.bundle.lockedBannerIn', { names: lockedInBundles.map((b) => b.name.fr).join(', ') }) }}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.products.club') }}</span>
          <select
            v-model="clubId"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-white dark:bg-sidebar-surface focus:ring-2 focus:ring-brand-primary focus:outline-none"
          >
            <option v-for="c in clubs.items" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.products.reference') }}</span>
          <input
            v-model="reference"
            type="text"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>

        <label class="block md:col-span-2">
          <span class="text-sm font-medium">{{ t('admin.products.name') }}</span>
          <input
            v-model="name"
            type="text"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.products.category') }}</span>
          <input
            v-model="category"
            type="text"
            list="product-category-options"
            autocomplete="off"
            :placeholder="t('admin.products.categoryPlaceholder')"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
          <!-- * Native browser autocomplete from already-used categories
               (shared across all clubs). Typing a new value is still allowed. -->
          <datalist id="product-category-options">
            <option v-for="c in knownCategories" :key="c" :value="c" />
          </datalist>
          <p class="text-xs text-gray-500 mt-1">{{ t('admin.products.categoryHint') }}</p>
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.products.weight') }}</span>
          <div class="flex items-center gap-2 mt-1">
            <input
              v-model.number="weightGrams"
              type="number"
              min="0"
              step="1"
              class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
            />
            <span class="text-gray-500">g</span>
          </div>
          <p class="text-xs text-gray-500 mt-1">{{ t('admin.products.weightHint') }}</p>
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.products.availableFrom') }}</span>
          <input
            v-model="availableFrom"
            type="date"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
          <p class="text-xs text-gray-500 mt-1">{{ t('admin.products.availableFromHint') }}</p>
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.products.footspotCategory') }}</span>
          <select
            v-model="footspotCategory"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          >
            <option value="">{{ t('admin.products.footspotNotSynced') }}</option>
            <option v-for="c in FOOTSPOT_CATEGORIES" :key="c" :value="c">
              {{ t(`admin.products.footspotCategories.${c}`) }}
            </option>
          </select>
          <p class="text-xs text-gray-500 mt-1">{{ t('admin.products.footspotCategoryHint') }}</p>
        </label>
      </div>

      <!-- Description (optional, FR/EN) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.products.detailsFr') }}</span>
          <textarea
            v-model="detailsFr"
            rows="3"
            :placeholder="t('admin.products.detailsPlaceholder')"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none resize-y"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.products.detailsEn') }}</span>
          <textarea
            v-model="detailsEn"
            rows="3"
            :placeholder="t('admin.products.detailsPlaceholder')"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none resize-y"
          />
        </label>
      </div>

      <!-- Pack toggle -->
      <div class="border-t border-gray-100 dark:border-sidebar pt-4 space-y-3">
        <label class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-sidebar cursor-pointer">
          <input v-model="isPack" type="checkbox" class="w-4 h-4 accent-brand-primary" />
          <div>
            <div class="text-sm font-medium">{{ t('admin.products.pack.enable') }}</div>
            <div class="text-xs text-gray-500">{{ t('admin.products.pack.hint') }}</div>
          </div>
        </label>

        <label class="flex items-center gap-3 p-3 rounded-lg bg-brand-secondary/5 border border-brand-secondary/20 cursor-pointer">
          <input v-model="isOnClearance" type="checkbox" class="w-4 h-4 accent-brand-secondary" />
          <div>
            <div class="text-sm font-medium flex items-center gap-1.5">
              <UIcon name="i-lucide-tag" class="w-4 h-4 text-brand-secondary" />
              {{ t('admin.products.clearance.enable') }}
            </div>
            <div class="text-xs text-gray-500">{{ t('admin.products.clearance.hint') }}</div>
          </div>
        </label>
      </div>

      <!-- Pricing -->
      <div class="border-t border-gray-100 dark:border-sidebar pt-4 space-y-4">
        <h4 class="font-heading font-bold">{{ t('admin.products.pricing') }}</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-3">
            <label class="block">
              <span class="text-sm font-medium">{{ t('admin.products.buyingPrice') }}</span>
              <div class="flex items-center gap-2 mt-1">
                <input
                  v-model.number="buyingPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  :disabled="isPack"
                  :title="isPack ? 'Auto: somme des composants' : undefined"
                  class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none disabled:opacity-60"
                />
                <span class="text-gray-500">€</span>
              </div>
            </label>
            <label class="block">
              <span class="text-sm font-medium">{{ t('admin.products.sellingPrice') }}</span>
              <div class="flex items-center gap-2 mt-1">
                <input
                  v-model.number="sellingPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
                />
                <span class="text-gray-500">€</span>
              </div>
            </label>
            <AdminProductsDiscountField
              :percent="discountPercent"
              :source="discountSource"
              @update:percent="(v) => (discountPercent = v)"
              @update:source="(v) => (discountSource = v)"
            />
          </div>
          <AdminProductsPricePreview :input="pricingInput" />
        </div>
      </div>

      <!-- Colors → Images → Sizes (non-pack) / Images → Composition (pack).
           The image picker sits between colors and sizes so staff define the
           colors first, attach each photo to a color, then build the size rows
           per color. -->
      <div class="border-t border-gray-100 dark:border-sidebar pt-4 space-y-4">
        <AdminProductsProductColorsEditor v-if="!isPack" v-model="colors" />

        <AdminProductsGalleryEditor
          v-model="gallerySlots"
          bucket="product-images"
          :label="t('admin.products.image')"
          :club-logo-url="selectedClubLogoUrl"
          :colors="isPack ? [] : colors"
        />

        <AdminProductsBundleComponentsEditor
          v-if="isPack"
          v-model="bundleComponents"
          :club-id="clubId"
        />
        <AdminProductsVariantStockEditor
          v-else
          v-model="variants"
          :footspot-enabled="!!footspotCategory"
          :colors="colors"
        />
      </div>

      <!-- Flocking -->
      <div class="border-t border-gray-100 dark:border-sidebar pt-4 space-y-3">
        <h4 class="font-heading font-bold">{{ t('admin.products.flocking.title') }}</h4>
        <div class="grid grid-cols-3 gap-2">
          <label
            v-for="kind in (['none','members','supporters'] as const)"
            :key="kind"
            class="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors"
            :class="flockingKind === kind ? 'border-brand-primary bg-brand-primary/5 text-brand-primary' : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
          >
            <input v-model="flockingKind" :value="kind" type="radio" class="accent-brand-primary" />
            <span>{{ t(`admin.products.flocking.kind.${kind}`) }}</span>
          </label>
        </div>

        <div v-if="flockingKind === 'members'" class="space-y-3 pl-3 border-l-2 border-brand-primary/30">
          <p class="text-xs text-gray-500">{{ t('admin.products.flocking.membersHint') }}</p>
          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-sm font-medium">{{ t('admin.products.flocking.nameOnBackPrice') }}</span>
              <div class="flex items-center gap-2 mt-1">
                <input
                  v-model.number="flockingMembersNamePrice"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
                />
                <span class="text-gray-500">€</span>
              </div>
            </label>
            <label class="block">
              <span class="text-sm font-medium">{{ t('admin.products.flocking.initialsPrice') }}</span>
              <div class="flex items-center gap-2 mt-1">
                <input
                  v-model.number="flockingMembersInitialsPrice"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
                />
                <span class="text-gray-500">€</span>
              </div>
            </label>
          </div>
        </div>

        <div v-if="flockingKind === 'supporters'" class="space-y-3 pl-3 border-l-2 border-brand-primary/30">
          <p class="text-xs text-gray-500">{{ t('admin.products.flocking.supportersHint') }}</p>
          <label class="block">
            <span class="text-sm font-medium">{{ t('admin.products.flocking.supporterPrice') }}</span>
            <div class="flex items-center gap-2 mt-1">
              <input
                v-model.number="flockingSupporterPrice"
                type="number"
                min="0"
                step="0.01"
                class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
              />
              <span class="text-gray-500">€</span>
            </div>
          </label>
        </div>
      </div>

      <!-- Custom paid options (dynamic) -->
      <div class="border-t border-gray-100 dark:border-sidebar pt-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="font-heading font-bold">{{ t('admin.products.options.title') }}</h4>
            <p class="text-xs text-gray-500">{{ t('admin.products.options.hint') }}</p>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-brand-primary text-brand-primary hover:bg-brand-primary/5"
            @click="addOption"
          >
            <UIcon name="i-lucide-plus" class="w-4 h-4" />
            {{ t('admin.products.options.add') }}
          </button>
        </div>

        <p v-if="options.length === 0" class="text-sm text-gray-400">
          {{ t('admin.products.options.empty') }}
        </p>

        <div
          v-for="(opt, i) in options"
          :key="i"
          class="rounded-lg border border-gray-200 dark:border-sidebar p-3 space-y-3"
        >
          <div class="flex items-end gap-2">
            <label class="block flex-1">
              <span class="text-sm font-medium">{{ t('admin.products.options.name') }}</span>
              <input
                v-model="opt.name"
                type="text"
                :placeholder="t('admin.products.options.namePlaceholder')"
                class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
              />
            </label>
            <label class="block w-32">
              <span class="text-sm font-medium">{{ t('admin.products.options.price') }}</span>
              <div class="flex items-center gap-2 mt-1">
                <input
                  v-model.number="opt.price"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
                />
                <span class="text-gray-500">€</span>
              </div>
            </label>
            <button
              type="button"
              class="p-2 mb-0.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-brand-secondary/5"
              :title="t('common.delete')"
              @click="removeOption(i)"
            >
              <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
            </button>
          </div>

          <!-- * Optional free-text input the customer can fill (e.g. a number) -->
          <label class="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="opt.allow_custom_input" type="checkbox" class="w-4 h-4 accent-brand-primary" />
            <span>{{ t('admin.products.options.allowInput') }}</span>
          </label>
          <label v-if="opt.allow_custom_input" class="block">
            <span class="text-sm font-medium">{{ t('admin.products.options.inputLabel') }}</span>
            <input
              v-model="opt.input_label"
              type="text"
              :placeholder="t('admin.products.options.inputLabelPlaceholder')"
              class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
            />
            <p class="text-xs text-gray-500 mt-1">{{ t('admin.products.options.inputHint') }}</p>
          </label>
        </div>
      </div>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <div class="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-sidebar">
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
          :disabled="saving"
          @click="close"
        >
          {{ t('common.cancel') }}
        </button>
        <button
          type="button"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:bg-brand-primary-dark disabled:opacity-60"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
