<script setup lang="ts">
// * Storefront "latest Instagram post" block. Binds to the instagram store,
// * which reads posts cached in Postgres by the instagram-sync worker. We render
// * our own card (not Instagram's embed.js blockquote) so it stays on-brand,
// * fast, and free of a third-party script. Renders nothing until a post exists.
import { useInstagramStore } from '~/stores/instagram'

const { t } = useI18n()
const instagram = useInstagramStore()

const post = computed(() => instagram.latest)
// * Video posts expose a poster in thumbnail_url; images use media_url directly.
const imageSrc = computed(() => post.value?.thumbnail_url || post.value?.media_url || null)
const isVideo = computed(() => post.value?.media_type === 'VIDEO')

// * Captions can be long — keep the card tidy.
const caption = computed(() => {
  const c = post.value?.caption?.trim()
  if (!c) return ''
  return c.length > 200 ? c.slice(0, 197) + '…' : c
})
</script>

<template>
  <section v-if="post" class="px-6 md:px-10 pb-16">
    <div class="mb-6 flex items-center gap-2">
      <UIcon name="i-lucide-instagram" class="w-5 h-5 text-brand-secondary" />
      <h2 class="font-heading text-xl md:text-[22px] font-bold leading-tight">
        {{ t('storefront.instagram.title') }}
      </h2>
    </div>

    <a
      :href="post.permalink || '#'"
      target="_blank"
      rel="noopener noreferrer"
      class="group block no-underline text-inherit rounded-2xl overflow-hidden border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar-surface transition-all hover:-translate-y-1 hover:shadow-card-lg hover:border-transparent md:flex"
    >
      <div class="relative md:w-1/2 aspect-square md:aspect-auto overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 dark:from-sidebar dark:to-sidebar-surface">
        <img
          v-if="imageSrc"
          :src="imageSrc"
          :alt="caption || t('storefront.instagram.title')"
          loading="lazy"
          class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <UIcon
          v-else
          name="i-lucide-image"
          class="absolute inset-0 m-auto w-12 h-12 text-gray-300 opacity-40"
        />
        <span
          v-if="isVideo"
          class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center"
        >
          <UIcon name="i-lucide-play" class="w-4 h-4" />
        </span>
      </div>

      <div class="p-5 md:w-1/2 md:flex md:flex-col md:justify-center">
        <p class="text-xs uppercase tracking-wider text-gray-400 mb-2">
          {{ t('storefront.instagram.subtitle') }}
        </p>
        <p v-if="caption" class="text-sm leading-relaxed text-gray-700 dark:text-gray-200 whitespace-pre-line">
          {{ caption }}
        </p>
        <span
          class="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-secondary group-hover:gap-2.5 transition-all"
        >
          {{ t('storefront.instagram.cta') }}
          <UIcon name="i-lucide-arrow-up-right" class="w-4 h-4" />
        </span>
      </div>
    </a>
  </section>
</template>
