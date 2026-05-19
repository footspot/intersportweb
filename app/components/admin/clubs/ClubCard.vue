<script setup lang="ts">
import type { Club } from '~/stores/clubs'
import type { Sport } from '~/stores/sports'

interface Props {
  club: Club
  sport: Sport | null
}
const props = defineProps<Props>()
defineEmits<{
  (e: 'edit', club: Club): void
  (e: 'delete', club: Club): void
  (e: 'reset-password', club: Club): void
}>()

const { t, locale } = useI18n()
const client = useSupabaseClient()

const logoUrl = computed(() => {
  if (!props.club.logo_path) return null
  const { data } = client.storage.from('club-logos').getPublicUrl(props.club.logo_path)
  return data?.publicUrl ?? null
})

const fundTier = computed(() => {
  const v = Number(props.club.fund_balance ?? 0)
  if (v <= 0) return 'text-brand-secondary bg-brand-secondary/10'
  if (v < 500) return 'text-brand-gold bg-brand-gold/10'
  return 'text-brand-green bg-brand-green/10'
})

const sportLabel = computed(() => {
  if (!props.sport) return ''
  return props.sport.name[locale.value as 'fr' | 'en'] ?? props.sport.name.fr
})

function fmt(v: number | string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}
</script>

<template>
  <article
    class="group relative overflow-hidden bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5 flex flex-col gap-4 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-card-md before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-brand-primary before:origin-center before:scale-x-0 before:transition-transform before:duration-300 hover:before:scale-x-100"
  >
    <div class="flex items-start gap-4">
      <div class="w-14 h-14 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden shrink-0">
        <img v-if="logoUrl" :src="logoUrl" class="w-full h-full object-cover" alt="" />
        <UIcon v-else name="i-lucide-shield" class="w-6 h-6 text-gray-400" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-heading text-base font-bold truncate">{{ club.name }}</h3>
        <p class="text-xs text-gray-500 truncate">{{ sportLabel }}</p>
        <div class="flex items-center gap-2 mt-2">
          <span v-if="club.is_password_protected" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-gold/10 text-brand-gold text-xs">
            <UIcon name="i-lucide-lock" class="w-3 h-3" />
            <span>{{ t('admin.clubs.protected') }}</span>
          </span>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 text-sm">
      <div>
        <div class="text-xs text-gray-500">{{ t('admin.clubs.products') }}</div>
        <div class="font-medium">{{ club.product_count ?? 0 }}</div>
      </div>
      <div>
        <div class="text-xs text-gray-500">{{ t('admin.clubs.fund') }}</div>
        <div class="font-medium inline-flex items-center px-2 py-0.5 rounded-full text-xs" :class="fundTier">
          {{ fmt(club.fund_balance) }}
        </div>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100 dark:border-sidebar">
      <button
        type="button"
        class="group flex items-center justify-center h-9 rounded-lg bg-gray-50 dark:bg-sidebar border border-gray-200 dark:border-sidebar hover:bg-gray-100 dark:hover:bg-sidebar-bg transition-colors"
        :aria-label="t('admin.clubs.resetPassword')"
        :title="t('admin.clubs.resetPassword')"
        @click="$emit('reset-password', club)"
      >
        <span class="flex items-center justify-center w-6 h-6 rounded-md bg-brand-gold/15 text-brand-gold group-hover:bg-brand-gold/25 transition-colors">
          <UIcon name="i-lucide-key-round" class="w-3.5 h-3.5" />
        </span>
      </button>
      <button
        type="button"
        class="group flex items-center justify-center h-9 rounded-lg bg-gray-50 dark:bg-sidebar border border-gray-200 dark:border-sidebar hover:bg-gray-100 dark:hover:bg-sidebar-bg transition-colors"
        :aria-label="t('common.edit')"
        :title="t('common.edit')"
        @click="$emit('edit', club)"
      >
        <span class="flex items-center justify-center w-6 h-6 rounded-md bg-brand-primary/15 text-brand-primary group-hover:bg-brand-primary/25 transition-colors">
          <UIcon name="i-lucide-pencil" class="w-3.5 h-3.5" />
        </span>
      </button>
      <button
        type="button"
        class="group flex items-center justify-center h-9 rounded-lg bg-gray-50 dark:bg-sidebar border border-gray-200 dark:border-sidebar hover:bg-brand-secondary/10 hover:border-brand-secondary/30 transition-colors"
        :aria-label="t('common.delete')"
        :title="t('common.delete')"
        @click="$emit('delete', club)"
      >
        <span class="flex items-center justify-center w-6 h-6 rounded-md bg-brand-secondary/15 text-brand-secondary group-hover:bg-brand-secondary/25 transition-colors">
          <UIcon name="i-lucide-trash-2" class="w-3.5 h-3.5" />
        </span>
      </button>
    </div>
  </article>
</template>
