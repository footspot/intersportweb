<script setup lang="ts">
// * /product/[productId] — detail page with size selector, flocking, add-to-cart.
// * Supports bundles (is_pack): two pills driven by computed availability.
import { useProductsStore, primaryImagePath } from '~/stores/products'
import { useClubsStore } from '~/stores/clubs'
import { useCartStore, type FlockingOptions } from '~/stores/cart'
import { useClubAccessStore } from '~/stores/clubAccess'
import { useProductDiscountsStore } from '~/stores/productDiscounts'
import { computeUnitPricing, applyClubDiscount } from '~/composables/usePricingPreview'
import { useBundleAvailability } from '~/composables/useBundleAvailability'

const route = useRoute()
const productId = computed(() => String(route.params.productId))

const { t, locale } = useI18n()
const products = useProductsStore()
const clubs = useClubsStore()
const cart = useCartStore()
const access = useClubAccessStore()
const productDiscounts = useProductDiscountsStore()
const client = useSupabaseClient()
const cartOpen = useState('customer:cart-open', () => false)

await useAsyncData(`product-${productId.value}`, async () => {
  await Promise.all([clubs.fetchAll(), products.fetchAll(), productDiscounts.fetchAll()])
  return true
})

const product = computed(() => products.byId(productId.value))
const club = computed(() => (product.value ? clubs.byId(product.value.club_id) : null))

const requiresPassword = computed(
  () => !!club.value?.is_password_protected && !access.hasAccess(club.value.id),
)

// * If this product is a component of any bundle, it's hidden from customers.
const isLockedComponent = computed(() =>
  product.value ? products.isComponent(product.value.id) : false,
)

const selectedSize = ref<string | null>(null)
const selectedSecondarySize = ref<string | null>(null)
const selectedColorId = ref<string | null>(null)
const flocking = ref<FlockingOptions>({ name: null, initial: null, number: null })
const flockingAddon = ref(0)
const feedback = ref<{ tone: 'ok' | 'err'; msg: string } | null>(null)

// * Custom paid options (multi-select). Each ticked option adds its price.
const selectedOptionIds = ref<string[]>([])
const productOptions = computed(() => product.value?.options ?? [])
const selectedOptions = computed(() =>
  productOptions.value
    .filter((o) => selectedOptionIds.value.includes(o.id))
    .map((o) => ({ id: o.id, name: o.name, price: Number(o.price) })),
)
const optionsAddon = computed(() => selectedOptions.value.reduce((s, o) => s + o.price, 0))
function toggleOption(id: string) {
  selectedOptionIds.value = selectedOptionIds.value.includes(id)
    ? selectedOptionIds.value.filter((x) => x !== id)
    : [...selectedOptionIds.value, id]
}

// * Bundle availability (null-safe; returns empty for non-packs).
const availability = computed(() => useBundleAvailability(product.value))

// * Color variants (empty for products without colors / for packs).
const productColors = computed(() => (product.value?.is_pack ? [] : product.value?.colors ?? []))
const hasColors = computed(() => productColors.value.length > 0)
const selectedColor = computed(
  () => productColors.value.find((c) => c.id === selectedColorId.value) ?? null,
)

// * Variants available for the picked color (all variants when no colors).
const colorVariants = computed(() => {
  const vs = product.value?.variants ?? []
  if (!hasColors.value) return vs
  return vs.filter((v) => v.color_id === selectedColorId.value)
})

// * For regular products, the selected variant matches the picked color + size.
const selectedVariant = computed(() => {
  if (!product.value || product.value.is_pack) return null
  if (!selectedSize.value) return null
  return colorVariants.value.find((v) => v.size === selectedSize.value) ?? null
})

// * For bundles, max_stock is the units available for the picked combo.
const bundleMaxStock = computed(() => {
  if (!product.value?.is_pack) return 0
  if (!selectedSize.value) return 0
  const key = `${selectedSize.value}::${selectedSecondarySize.value ?? ''}`
  return availability.value.stockMatrix[key] ?? 0
})

// * Options for the primary pill selector.
const primaryOptions = computed(() => {
  if (!product.value) return []
  if (product.value.is_pack) {
    const a = availability.value
    return a.primarySizes.map((s) => {
      // * A primary size is disabled if, for the currently picked secondary
      // * (or any secondary if none picked), the combo is out of stock.
      let disabled: boolean
      if (a.hasSecondary) {
        if (selectedSecondarySize.value) {
          disabled = (a.stockMatrix[`${s}::${selectedSecondarySize.value}`] ?? 0) <= 0
        } else {
          disabled = a.secondarySizes.every(
            (sec) => (a.stockMatrix[`${s}::${sec}`] ?? 0) <= 0,
          )
        }
      } else {
        disabled = (a.stockMatrix[`${s}::`] ?? 0) <= 0
      }
      return { value: s, disabled }
    })
  }
  // * Regular product: one option per variant of the picked color. Stock<=0
  // * disables the size EXCEPT when the product has an `available_from` date —
  // * then the size is still pickable but marked as backorder.
  const backorderable = !!product.value.available_from
  return colorVariants.value.map((v) => ({
    value: v.size,
    disabled: v.stock <= 0 && !backorderable,
    backorder: v.stock <= 0 && backorderable,
  }))
})

// * True when the picked variant is OOS but the product is backorderable.
const isSelectedBackorder = computed(
  () => !!(product.value?.available_from && selectedVariant.value && selectedVariant.value.stock <= 0),
)

const secondaryOptions = computed(() => {
  if (!product.value?.is_pack) return []
  const a = availability.value
  if (!a.hasSecondary) return []
  return a.secondarySizes.map((s) => {
    let disabled: boolean
    if (selectedSize.value) {
      disabled = (a.stockMatrix[`${selectedSize.value}::${s}`] ?? 0) <= 0
    } else {
      disabled = a.primarySizes.every(
        (p) => (a.stockMatrix[`${p}::${s}`] ?? 0) <= 0,
      )
    }
    return { value: s, disabled }
  })
})

// * Gallery filtered to the picked color. Untagged images (color_id null) show
// * for every color. Falls back to the full gallery if the color has none.
const galleryImages = computed(() => {
  const imgs = product.value?.images ?? []
  if (!hasColors.value || !selectedColorId.value) return imgs
  const matching = imgs.filter((i) => i.color_id === selectedColorId.value || i.color_id == null)
  return matching.length ? matching : imgs
})
const selectedImageIndex = ref(0)

// * Reset pickers + gallery index + default color whenever we land on a
// * different product (immediate so the first color is selected on load).
watch(
  () => product.value?.id,
  () => {
    selectedSize.value = null
    selectedSecondarySize.value = null
    selectedColorId.value = product.value?.is_pack ? null : product.value?.colors?.[0]?.id ?? null
    flocking.value = { name: null, initial: null, number: null }
    flockingAddon.value = 0
    selectedOptionIds.value = []
    selectedImageIndex.value = 0
  },
  { immediate: true },
)

// * Switching color clears the size pick (sizes differ per color) and resets
// * the gallery to the first image of that color.
watch(selectedColorId, () => {
  selectedSize.value = null
  selectedImageIndex.value = 0
})

function storageUrl(path: string | null): string | null {
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}

const imageUrl = computed(() =>
  storageUrl(
    galleryImages.value[selectedImageIndex.value]?.image_path ??
      primaryImagePath(product.value),
  ),
)

// * Representative image for the picked color — snapshotted onto the cart line.
const colorImagePath = computed(() => {
  if (!selectedColorId.value) return null
  return (product.value?.images ?? []).find((i) => i.color_id === selectedColorId.value)?.image_path ?? null
})

const pricing = computed(() =>
  product.value
    ? computeUnitPricing({
        buying_price: Number(product.value.buying_price),
        selling_price: Number(product.value.selling_price),
        discount_percent: Number(product.value.discount_percent ?? 0),
        discount_source: product.value.discount_source ?? null,
      })
    : null,
)

// * Footspot club discount layered on top of the catalogue price.
const footspotPct = computed(() =>
  product.value ? productDiscounts.pctFor(product.value.club_id, product.value.reference) : 0,
)
// * Per-unit price the buyer pays, before the flocking add-on.
const finalUnitPrice = computed(() =>
  applyClubDiscount(pricing.value?.unit_price_paid ?? 0, footspotPct.value),
)
// * Badge shows the Footspot club discount when set, else the product's own.
const displayDiscountPct = computed(() =>
  footspotPct.value > 0 ? footspotPct.value : Number(product.value?.discount_percent ?? 0),
)
const hasDiscount = computed(() => displayDiscountPct.value > 0)

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

// * Components displayed on the bundle detail (image + name + ref + qty).
const bundleDisplayComponents = computed(() => {
  if (!product.value?.is_pack) return []
  return product.value.bundle_components
    .map((bc) => {
      const p = products.byId(bc.component_product_id)
      return p ? { bc, product: p } : null
    })
    .filter((x): x is { bc: any; product: any } => !!x)
})

function componentImageUrl(p: { images?: { image_path: string }[] } | null | undefined): string | null {
  const path = p?.images?.[0]?.image_path ?? null
  return storageUrl(path)
}

const canAddToCart = computed(() => {
  if (!product.value) return false
  if (requiresPassword.value) return false
  if (isLockedComponent.value) return false
  if (product.value.is_pack) {
    if (!selectedSize.value) return false
    if (availability.value.hasSecondary && !selectedSecondarySize.value) return false
    return bundleMaxStock.value > 0
  }
  if (hasColors.value && !selectedColorId.value) return false
  if (!selectedVariant.value) return false
  if (selectedVariant.value.stock > 0) return true
  return !!product.value.available_from
})

function addToCart() {
  feedback.value = null
  if (!product.value) return
  if (requiresPassword.value) {
    feedback.value = { tone: 'err', msg: t('storefront.product.errors.locked') }
    return
  }
  if (isLockedComponent.value) {
    feedback.value = { tone: 'err', msg: t('storefront.product.errors.componentOnly') }
    return
  }

  if (product.value.is_pack) {
    if (!selectedSize.value || (availability.value.hasSecondary && !selectedSecondarySize.value)) {
      feedback.value = { tone: 'err', msg: t('storefront.product.errors.pickSize') }
      return
    }
    if (bundleMaxStock.value <= 0) {
      feedback.value = { tone: 'err', msg: t('storefront.product.errors.outOfStock') }
      return
    }
    cart.add({
      product: product.value,
      variantId: null,
      size: selectedSize.value,
      secondarySize: selectedSecondarySize.value,
      maxStock: bundleMaxStock.value,
      quantity: 1,
      flocking: flocking.value,
      flockingAddon: flockingAddon.value,
      options: selectedOptions.value,
      footspotDiscountPct: footspotPct.value,
    })
  } else {
    if (!selectedVariant.value) {
      feedback.value = { tone: 'err', msg: t('storefront.product.errors.pickSize') }
      return
    }
    const backorderable = !!product.value.available_from
    if (selectedVariant.value.stock <= 0 && !backorderable) {
      feedback.value = { tone: 'err', msg: t('storefront.product.errors.outOfStock') }
      return
    }
    cart.add({
      product: product.value,
      variantId: selectedVariant.value.id,
      size: selectedVariant.value.size,
      secondarySize: null,
      color: selectedColor.value?.name ?? null,
      colorImagePath: colorImagePath.value,
      // * Backorder cap: 99 if stock is exhausted, otherwise the real stock.
      maxStock: backorderable ? Math.max(selectedVariant.value.stock, 99) : selectedVariant.value.stock,
      quantity: 1,
      flocking: flocking.value,
      flockingAddon: flockingAddon.value,
      options: selectedOptions.value,
      footspotDiscountPct: footspotPct.value,
    })
  }

  feedback.value = { tone: 'ok', msg: t('storefront.product.addedToCart') }
  setTimeout(() => {
    cartOpen.value = true
  }, 150)
}

// * SEO — dynamic title/description/OG + Product JSON-LD. Getters keep it
// * reactive as the product resolves; absolute Supabase image URL feeds og:image.
const seoTitle = computed(() =>
  product.value ? `${product.value.name.fr} — Intersport Club IDF` : 'Intersport Club IDF',
)
const seoDescription = computed(() => {
  const d = product.value?.details?.fr?.trim()
  if (d) return d.slice(0, 160)
  return product.value
    ? `${product.value.name.fr}${club.value ? ' — ' + club.value.name : ''}. Disponible sur la boutique Intersport Club IDF.`
    : 'Boutique Intersport Club IDF.'
})

useSeoMeta({
  title: () => seoTitle.value,
  description: () => seoDescription.value,
  ogTitle: () => seoTitle.value,
  ogDescription: () => seoDescription.value,
  ogImage: () => imageUrl.value ?? undefined,
  twitterCard: 'summary_large_image',
})

useSchemaOrg([
  defineProduct({
    name: () => product.value?.name.fr ?? '',
    description: () => seoDescription.value,
    image: () => (imageUrl.value ? [imageUrl.value] : []),
    sku: () => product.value?.reference ?? undefined,
    offers: () => [
      {
        price: Number(finalUnitPrice.value.toFixed(2)),
        priceCurrency: 'EUR',
        availability: canAddToCart.value ? 'InStock' : 'OutOfStock',
      },
    ],
  }),
])
</script>

<template>
  <section v-if="product && !isLockedComponent" class="max-w-6xl mx-auto px-4 py-8">
    <NuxtLink
      v-if="club"
      :to="`/?club=${club.id}`"
      class="text-sm text-gray-500 hover:text-brand-primary inline-flex items-center gap-1 mb-4"
    >
      <UIcon name="i-lucide-chevron-left" class="w-4 h-4" />
      {{ club.name }}
    </NuxtLink>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div class="space-y-3">
        <div class="aspect-square rounded-card bg-gray-100 dark:bg-sidebar-surface overflow-hidden">
          <img
            v-if="imageUrl"
            :src="imageUrl"
            class="w-full h-full object-contain"
            :alt="product.name.fr"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <UIcon name="i-lucide-image" class="w-14 h-14 text-gray-300" />
          </div>
        </div>
        <div
          v-if="galleryImages.length > 1"
          class="flex gap-2 overflow-x-auto"
        >
          <button
            v-for="(img, i) in galleryImages"
            :key="img.id"
            type="button"
            class="w-16 h-16 rounded-lg overflow-hidden border-2 bg-gray-100 dark:bg-sidebar shrink-0 transition-all"
            :class="i === selectedImageIndex ? 'border-brand-primary' : 'border-transparent opacity-70 hover:opacity-100'"
            @click="selectedImageIndex = i"
          >
            <img
              :src="storageUrl(img.image_path)!"
              class="w-full h-full object-cover"
              :alt="product.name.fr"
            />
          </button>
        </div>
      </div>

      <div class="space-y-5">
        <div>
          <p v-if="club" class="text-sm text-gray-500">{{ club.name }}</p>
          <h1 class="font-heading text-3xl font-bold">
            {{ product.name.fr }}
          </h1>
          <p class="text-xs text-gray-500">{{ product.reference }}</p>
        </div>

        <div class="flex items-baseline gap-3">
          <span class="font-heading text-3xl font-bold">{{ fmt(finalUnitPrice + flockingAddon + optionsAddon) }}</span>
          <span
            v-if="hasDiscount"
            class="text-base text-gray-400 line-through"
          >
            {{ fmt(Number(product.selling_price)) }}
          </span>
          <span
            v-if="hasDiscount"
            class="text-xs px-2 py-0.5 rounded-full bg-brand-secondary text-white font-bold"
          >
            -{{ displayDiscountPct }}%
          </span>
          <span v-if="flockingAddon > 0" class="text-xs text-brand-secondary">
            {{ t('storefront.product.flocking.addonNote', { amount: fmt(flockingAddon) }) }}
          </span>
        </div>

        <div v-if="product.details?.[locale as 'fr' | 'en'] || product.details?.fr" class="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">
          {{ product.details?.[locale as 'fr' | 'en'] ?? product.details?.fr }}
        </div>

        <div
          v-if="product.available_from && !product.is_pack && (product.variants ?? []).every((v) => v.stock <= 0)"
          class="text-sm rounded-lg p-3 bg-brand-gold/10 border border-brand-gold/30 text-brand-gold flex items-start gap-2"
        >
          <UIcon name="i-lucide-clock" class="w-4 h-4 mt-0.5 shrink-0" />
          <span>{{ t('storefront.product.backorderBanner', { date: product.available_from }) }}</span>
        </div>

        <div v-if="hasColors">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium">
              {{ t('storefront.product.color') }}
              <span v-if="selectedColor" class="text-gray-500 font-normal"> · {{ selectedColor.name }}</span>
            </span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in productColors"
              :key="c.id"
              type="button"
              class="w-9 h-9 rounded-full border-2 transition-all"
              :class="selectedColorId === c.id
                ? 'border-brand-primary ring-2 ring-brand-primary/30'
                : 'border-gray-200 dark:border-sidebar hover:border-brand-primary/50'"
              :style="{ backgroundColor: c.hex }"
              :title="c.name"
              :aria-label="c.name"
              @click="selectedColorId = c.id"
            />
          </div>
        </div>

        <HomeSizeSelector
          v-if="primaryOptions.length"
          :options="primaryOptions"
          v-model="selectedSize"
        />

        <p
          v-if="isSelectedBackorder"
          class="text-xs text-brand-gold flex items-center gap-1.5"
        >
          <UIcon name="i-lucide-clock" class="w-3.5 h-3.5" />
          {{ t('storefront.product.backorderHint', { date: product.available_from }) }}
        </p>

        <HomeSizeSelector
          v-if="product.is_pack && secondaryOptions.length"
          :options="secondaryOptions"
          v-model="selectedSecondarySize"
          :label="t('storefront.product.secondarySize')"
        />

        <HomeFlockingOptions
          v-if="product.flocking_kind !== 'none'"
          v-model="flocking"
          :kind="product.flocking_kind"
          :name-price="Number(product.flocking_members_name_price)"
          :initials-price="Number(product.flocking_members_initials_price)"
          :supporter-price="Number(product.flocking_supporter_price)"
          @update:addon="(v) => (flockingAddon = v)"
        />

        <!-- * Custom paid options (multi-select) -->
        <div v-if="productOptions.length" class="space-y-2">
          <div class="inline-flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-plus-circle" class="w-4 h-4 text-brand-primary" />
            <span class="uppercase tracking-wider text-xs">{{ t('storefront.product.options.title') }}</span>
          </div>
          <label
            v-for="o in productOptions"
            :key="o.id"
            class="flex items-center gap-2 text-sm cursor-pointer"
          >
            <input
              type="checkbox"
              class="w-4 h-4 accent-brand-primary"
              :checked="selectedOptionIds.includes(o.id)"
              @change="toggleOption(o.id)"
            />
            <span class="font-medium">{{ o.name }}</span>
            <span class="text-brand-secondary text-xs">(+{{ fmt(Number(o.price)) }})</span>
          </label>
        </div>

        <div
          v-if="product.is_pack && bundleDisplayComponents.length"
          class="border-t border-gray-100 dark:border-sidebar pt-4"
        >
          <h3 class="font-heading font-bold text-sm mb-2">{{ t('storefront.product.packContents') }}</h3>
          <ul class="space-y-2">
            <li
              v-for="{ bc, product: cp } in bundleDisplayComponents"
              :key="cp.id"
              class="flex items-center gap-3"
            >
              <div class="w-10 h-10 rounded-lg bg-gray-100 dark:bg-sidebar overflow-hidden shrink-0 flex items-center justify-center">
                <img
                  v-if="componentImageUrl(cp)"
                  :src="componentImageUrl(cp)!"
                  class="w-full h-full object-cover"
                  :alt="cp.name.fr"
                />
                <UIcon v-else name="i-lucide-image" class="w-4 h-4 text-gray-300" />
              </div>
              <div class="flex-1 text-sm">
                <div class="text-gray-700 dark:text-gray-200">{{ cp.name[locale as 'fr' | 'en'] ?? cp.name.fr }}</div>
                <div class="text-xs text-gray-400">{{ cp.reference }}</div>
              </div>
              <span v-if="bc.quantity > 1" class="text-xs text-gray-500">× {{ bc.quantity }}</span>
            </li>
          </ul>
        </div>

        <p v-if="feedback" :class="feedback.tone === 'ok' ? 'text-sm text-brand-green' : 'text-sm text-brand-secondary'">
          <UIcon :name="feedback.tone === 'ok' ? 'i-lucide-check-circle-2' : 'i-lucide-alert-circle'" class="w-4 h-4 inline" />
          {{ feedback.msg }}
        </p>

        <button
          type="button"
          class="w-full py-3 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark disabled:opacity-60 inline-flex items-center justify-center gap-2"
          :disabled="!canAddToCart"
          @click="addToCart"
        >
          <UIcon name="i-lucide-shopping-bag" class="w-5 h-5" />
          {{ t('storefront.product.addToCart') }}
        </button>

        <div v-if="requiresPassword" class="text-xs text-brand-gold bg-brand-gold/10 rounded-lg p-3 text-center">
          <UIcon name="i-lucide-lock" class="w-3 h-3 inline" />
          {{ t('storefront.product.lockedHint') }}
        </div>
      </div>
    </div>
  </section>

  <section v-else-if="product && isLockedComponent" class="max-w-3xl mx-auto px-4 py-20 text-center text-gray-500">
    {{ t('storefront.product.componentOnly') }}
  </section>

  <section v-else class="max-w-3xl mx-auto px-4 py-20 text-center text-gray-500">
    {{ t('storefront.product.notFound') }}
  </section>
</template>
