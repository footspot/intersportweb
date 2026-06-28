<script setup lang="ts">
import { primaryImagePath, type Product } from '~/stores/products'
import { computeUnitPricing } from '~/composables/usePricingPreview'
import { useFavoritesStore } from '~/stores/favorites'

interface Props {
  product: Product
}
const props = defineProps<Props>()

const { t } = useI18n()
const client = useSupabaseClient()
const user = useSupabaseUser()
const favorites = useFavoritesStore()
const toast = useToast()

const isFav = computed(() => favorites.isFavorite(props.product.id))
const favBusy = ref(false)

// * Heart click. Guests get the login prompt (no redirect); signed-in users
// * toggle. `.prevent.stop` keeps the surrounding NuxtLink from navigating.
async function onToggleFav() {
  if (!user.value) {
    favorites.openPrompt()
    return
  }
  if (favBusy.value) return
  favBusy.value = true
  const wasFav = isFav.value
  try {
    await favorites.toggle(props.product.id)
    toast.add({
      title: wasFav ? t('favorites.removed') : t('favorites.added'),
      icon: wasFav ? 'i-lucide-heart-off' : 'i-lucide-heart',
      color: 'success',
    })
  } catch {
    toast.add({ title: t('favorites.error'), color: 'error' })
  } finally {
    favBusy.value = false
  }
}

const imageUrl = computed(() => {
  const path = primaryImagePath(props.product)
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
})

const pricing = computed(() =>
  computeUnitPricing({
    buying_price: Number(props.product.buying_price),
    selling_price: Number(props.product.selling_price),
    discount_percent: Number(props.product.discount_percent ?? 0),
    discount_source: props.product.discount_source ?? null,
  }),
)

const totalStock = computed(() =>
  (props.product.variants ?? []).reduce((s, v) => s + v.stock, 0),
)
const isBackorder = computed(() => !!props.product.available_from)
const isSoldOut = computed(() => totalStock.value <= 0 && !isBackorder.value)

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}
</script>

<template>
  <NuxtLink
    :to="`/product/${product.id}`"
    class="product-card group block bg-white dark:bg-sidebar-surface rounded-card overflow-hidden shadow-card-sm hover:shadow-card-md transition-all hover:-translate-y-1"
  >
    <div class="relative aspect-square bg-gray-100 dark:bg-sidebar overflow-hidden">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
        :alt="product.name.fr"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <UIcon name="i-lucide-image" class="w-10 h-10 text-gray-300" />
      </div>

      <span
        v-if="product.discount_percent > 0"
        class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-brand-secondary text-white text-xs font-bold"
      >
        -{{ product.discount_percent }}%
      </span>

      <!-- * Favorite toggle — top-right circular button, above the sold-out wash. -->
      <button
        type="button"
        :aria-label="isFav ? t('favorites.remove') : t('favorites.add')"
        :aria-pressed="isFav"
        :disabled="favBusy"
        class="fav-btn absolute top-2 right-2 z-20 w-9 h-9 grid place-items-center rounded-full bg-white/90 dark:bg-black/45 backdrop-blur-sm shadow-card-sm ring-1 ring-black/5 dark:ring-white/10 transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-60"
        :class="isFav ? 'text-brand-secondary' : 'text-gray-400 hover:text-brand-secondary'"
        @click.prevent.stop="onToggleFav"
      >
        <AppHeartIcon
          :filled="isFav"
          class="w-[18px] h-[18px] transition-transform"
          :class="isFav ? 'scale-110' : ''"
        />
      </button>

      <span
        v-if="isSoldOut"
        class="absolute inset-0 bg-black/50 text-white flex items-center justify-center font-heading font-bold text-lg"
      >
        {{ t('storefront.soldOut') }}
      </span>
      <span
        v-else-if="isBackorder && totalStock <= 0"
        class="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-brand-gold text-white text-xs font-bold"
      >
        {{ t('storefront.backorder') }}
      </span>
    </div>

    <div class="p-4">
      <h3 class="font-heading font-bold truncate">
        {{ product.name.fr }}
      </h3>
      <p class="text-xs text-gray-500 truncate">{{ product.reference }}</p>

      <div class="mt-2 flex items-baseline gap-2">
        <span class="font-heading text-lg font-bold">{{ fmt(pricing.unit_price_paid) }}</span>
        <span
          v-if="product.discount_percent > 0"
          class="text-xs text-gray-400 line-through"
        >
          {{ fmt(Number(product.selling_price)) }}
        </span>
      </div>
    </div>
  </NuxtLink>
</template>
