<script setup lang="ts">
// * Global error page — shown for SSR errors and abortNavigation() calls.
// * Delegates back to the default layout so the header/footer stay consistent.
import type { NuxtError } from '#app'

interface Props {
  error: NuxtError
}
const props = defineProps<Props>()

const { t } = useI18n()
const status = computed(() => Number(props.error?.statusCode ?? 500))

const title = computed(() => {
  if (status.value === 404) return t('errorPage.notFoundTitle')
  if (status.value === 403) return t('errorPage.forbiddenTitle')
  return t('errorPage.genericTitle')
})
const subtitle = computed(() => {
  if (status.value === 404) return t('errorPage.notFoundSubtitle')
  if (status.value === 403) return t('errorPage.forbiddenSubtitle')
  return t('errorPage.genericSubtitle')
})

function goHome() {
  clearError({ redirect: '/' })
}
</script>

<template>
  <NuxtLayout>
    <section class="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div class="font-heading text-[8rem] leading-none font-bold text-brand-primary opacity-90">
        {{ status }}
      </div>
      <h1 class="font-heading text-2xl font-bold mt-2">{{ title }}</h1>
      <p class="text-gray-500 mt-2 max-w-md">{{ subtitle }}</p>

      <div class="mt-8 flex flex-wrap gap-2 justify-center">
        <button
          type="button"
          class="px-5 py-2 rounded-card bg-brand-primary text-white font-medium hover:bg-brand-primary-dark"
          @click="goHome"
        >
          {{ t('errorPage.goHome') }}
        </button>
        <button
          type="button"
          class="px-5 py-2 rounded-card hover:bg-gray-100 dark:hover:bg-sidebar-surface"
          @click="$router.back()"
        >
          {{ t('errorPage.goBack') }}
        </button>
      </div>

      <p v-if="error?.message && status !== 404" class="mt-8 text-xs text-gray-400 max-w-md truncate">
        {{ error.message }}
      </p>
    </section>
  </NuxtLayout>
</template>
