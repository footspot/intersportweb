<script setup lang="ts">
// * Hero deck slide editor. Each slide is a stacked, throwable card; the admin
// * picks one of two kinds:
// *   • image   — a plain full-bleed image card (image required, optional title).
// *   • product — a rich product card linked to a product + its sport (badge,
// *               name, price, discount). Image optional (falls back to the
// *               product's primary image).
import { useCarouselStore, type HomeSlide, type SlideAnimation, type SlideKind } from '~/stores/carousel'
import { useProductsStore } from '~/stores/products'
import { useSportsStore } from '~/stores/sports'

interface Props {
  modelValue: boolean
  slide: HomeSlide | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'saved'): void
}>()

const { t, locale } = useI18n()
const carousel = useCarouselStore()
const products = useProductsStore()
const sports = useSportsStore()

const kind = ref<SlideKind>('image')
const title = ref('')
const subtitle = ref('')
const productId = ref<string | null>(null)
const sportId = ref<string | null>(null)
const imagePath = ref<string | null>(null)
const imageFile = ref<File | null>(null)
const animation = ref<SlideAnimation>('zoom')
const saving = ref(false)
const errorMsg = ref<string | null>(null)

// * Entrance-animation choices shown in the picker.
const animationOptions: { value: SlideAnimation; icon: string }[] = [
  { value: 'zoom', icon: 'i-lucide-zoom-in' },
  { value: 'soccer', icon: 'i-lucide-volleyball' },
  { value: 'basketball', icon: 'i-lucide-dribbble' },
]

const kindOptions: { value: SlideKind; icon: string }[] = [
  { value: 'image', icon: 'i-lucide-image' },
  { value: 'product', icon: 'i-lucide-shopping-bag' },
]

const visibleProducts = computed(() =>
  [...products.items]
    .filter((p) => p.is_visible)
    .sort((a, b) => (a.name[locale.value as 'fr' | 'en'] ?? a.name.fr).localeCompare(b.name[locale.value as 'fr' | 'en'] ?? b.name.fr)),
)
const sortedSports = computed(() => sports.sorted)

onMounted(() => {
  if (!products.items.length) products.fetchAll()
  if (!sports.items.length) sports.fetchAll()
})

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    kind.value = props.slide?.card_kind ?? 'image'
    title.value = props.slide?.title ?? ''
    subtitle.value = props.slide?.subtitle ?? ''
    productId.value = props.slide?.product_id ?? null
    sportId.value = props.slide?.sport_id ?? null
    imagePath.value = props.slide?.image_path ?? null
    imageFile.value = null
    animation.value = props.slide?.animation ?? 'zoom'
    errorMsg.value = null
  },
  { immediate: true },
)

// * When the admin picks a product, default the sport to the product's club sport
// * if it can be resolved — otherwise they pick it manually for the badge label.
watch(productId, (id) => {
  if (kind.value !== 'product' || !id) return
  if (!sportId.value && sortedSports.value.length === 1) sportId.value = sortedSports.value[0]!.id
})

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function save() {
  errorMsg.value = null
  if (kind.value === 'image' && !props.slide?.image_path && !imageFile.value) {
    errorMsg.value = t('admin.carousel.errors.imageRequired')
    return
  }
  if (kind.value === 'product' && !productId.value) {
    errorMsg.value = t('admin.carousel.errors.productRequired')
    return
  }
  saving.value = true
  try {
    const payload = {
      card_kind: kind.value,
      title: title.value.trim() || null,
      subtitle: kind.value === 'product' ? subtitle.value.trim() || null : null,
      product_id: kind.value === 'product' ? productId.value : null,
      sport_id: kind.value === 'product' ? sportId.value : null,
      sort_order: props.slide?.sort_order ?? carousel.items.length,
      animation: animation.value,
      file: imageFile.value,
    }
    if (props.slide) {
      await carousel.update({ id: props.slide.id, ...payload })
    } else {
      await carousel.create(payload)
    }
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : t('auth.errors.generic')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 overflow-y-auto py-6">
    <div class="w-full max-w-lg bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4 my-auto">
      <h3 class="font-heading text-xl font-bold">
        {{ slide ? t('admin.carousel.edit') : t('admin.carousel.new') }}
      </h3>

      <!-- * Card kind: plain image vs. linked product -->
      <div>
        <span class="text-sm font-medium">{{ t('admin.carousel.kindLabel') }}</span>
        <div class="mt-1 grid grid-cols-2 gap-2">
          <button
            v-for="opt in kindOptions"
            :key="opt.value"
            type="button"
            class="flex items-center justify-center gap-2 px-2 py-3 rounded-lg border text-sm font-medium transition"
            :class="
              kind === opt.value
                ? 'border-brand-primary text-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary'
                : 'border-gray-300 dark:border-sidebar text-gray-600 dark:text-gray-300 hover:border-brand-primary/50'
            "
            @click="kind = opt.value"
          >
            <UIcon :name="opt.icon" class="w-5 h-5" />
            {{ t(`admin.carousel.kinds.${opt.value}`) }}
          </button>
        </div>
      </div>

      <!-- * Product link (product kind only) -->
      <template v-if="kind === 'product'">
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.carousel.productLabel') }}</span>
          <select
            v-model="productId"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          >
            <option :value="null" disabled>{{ t('admin.carousel.productPlaceholder') }}</option>
            <option v-for="p in visibleProducts" :key="p.id" :value="p.id">
              {{ p.name[locale as 'fr' | 'en'] ?? p.name.fr }}
            </option>
          </select>
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.carousel.sportLabel') }}</span>
          <select
            v-model="sportId"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          >
            <option :value="null">{{ t('admin.carousel.sportPlaceholder') }}</option>
            <option v-for="s in sortedSports" :key="s.id" :value="s.id">
              {{ s.name[locale as 'fr' | 'en'] ?? s.name.fr }}
            </option>
          </select>
          <p class="text-xs text-gray-500 mt-1">{{ t('admin.carousel.sportHint') }}</p>
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.carousel.subtitleLabel') }}</span>
          <input
            v-model="subtitle"
            type="text"
            maxlength="80"
            :placeholder="t('admin.carousel.subtitlePlaceholder')"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>
      </template>

      <AdminImageUploader
        v-model:path="imagePath"
        v-model:file="imageFile"
        bucket="home-carousel"
        :label="kind === 'product' ? t('admin.carousel.imageOptional') : t('admin.carousel.image')"
      />
      <p v-if="kind === 'product'" class="text-xs text-gray-500 -mt-2">
        {{ t('admin.carousel.imageProductHint') }}
      </p>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.carousel.titleLabel') }}</span>
        <input
          v-model="title"
          type="text"
          maxlength="80"
          :placeholder="t('admin.carousel.titlePlaceholder')"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
        <p class="text-xs text-gray-500 mt-1">{{ t('admin.carousel.titleHint') }}</p>
      </label>

      <div>
        <span class="text-sm font-medium">{{ t('admin.carousel.animationLabel') }}</span>
        <div class="mt-1 grid grid-cols-3 gap-2">
          <button
            v-for="opt in animationOptions"
            :key="opt.value"
            type="button"
            class="flex flex-col items-center gap-1 px-2 py-3 rounded-lg border text-xs font-medium transition"
            :class="
              animation === opt.value
                ? 'border-brand-primary text-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary'
                : 'border-gray-300 dark:border-sidebar text-gray-600 dark:text-gray-300 hover:border-brand-primary/50'
            "
            @click="animation = opt.value"
          >
            <UIcon :name="opt.icon" class="w-5 h-5" />
            {{ t(`admin.carousel.animations.${opt.value}`) }}
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('admin.carousel.animationHint') }}</p>
      </div>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <div class="flex justify-end gap-2 pt-2">
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
