<script setup lang="ts">
// * Carousel slide editor — image (required) + optional title.
import { useCarouselStore, type HomeSlide, type SlideAnimation } from '~/stores/carousel'

interface Props {
  modelValue: boolean
  slide: HomeSlide | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const carousel = useCarouselStore()

const title = ref('')
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

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    title.value = props.slide?.title ?? ''
    imagePath.value = props.slide?.image_path ?? null
    imageFile.value = null
    animation.value = props.slide?.animation ?? 'zoom'
    errorMsg.value = null
  },
  { immediate: true },
)

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function save() {
  errorMsg.value = null
  if (!props.slide && !imageFile.value) {
    errorMsg.value = t('admin.carousel.errors.imageRequired')
    return
  }
  saving.value = true
  try {
    const payload = {
      title: title.value.trim() || null,
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
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
    <div class="w-full max-w-lg bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
      <h3 class="font-heading text-xl font-bold">
        {{ slide ? t('admin.carousel.edit') : t('admin.carousel.new') }}
      </h3>

      <AdminImageUploader
        v-model:path="imagePath"
        v-model:file="imageFile"
        bucket="home-carousel"
        :label="t('admin.carousel.image')"
      />

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
