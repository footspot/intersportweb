<script setup lang="ts">
import type { Club } from '~/stores/clubs'
import type { Sport } from '~/stores/sports'
import { useFundStore } from '~/stores/fund'

interface Props {
  club: Club
  sport: Sport | null
}
const props = defineProps<Props>()
defineEmits<{
  (e: 'credit', club: Club): void
  (e: 'debit', club: Club): void
}>()

const { t, locale } = useI18n()
const client = useSupabaseClient()
const fund = useFundStore()

const expanded = ref(false)

const logoUrl = computed(() => {
  if (!props.club.logo_path) return null
  const { data } = client.storage.from('club-logos').getPublicUrl(props.club.logo_path)
  return data?.publicUrl ?? null
})

const fundTierClass = computed(() => {
  const v = Number(props.club.fund_balance ?? 0)
  if (v <= 0) return 'from-brand-secondary/15 to-transparent text-brand-secondary'
  if (v < 500) return 'from-brand-gold/15 to-transparent text-brand-gold'
  return 'from-brand-green/15 to-transparent text-brand-green'
})

const accentBar = computed(() => {
  const v = Number(props.club.fund_balance ?? 0)
  if (v <= 0) return 'bg-brand-secondary'
  if (v < 500) return 'bg-brand-gold'
  return 'bg-brand-green'
})

const sportLabel = computed(() => {
  if (!props.sport) return ''
  return props.sport.name[locale.value as 'fr' | 'en'] ?? props.sport.name.fr
})

function fmt(v: number | string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v ?? 0))
}

// * Load history lazily — the last 3 tx are shown in the preview.
watch(
  () => props.club.id,
  async (id) => {
    if (!id) return
    if (!fund.historyByClub[id]) await fund.fetchHistory(id, 20)
  },
  { immediate: true },
)

const preview = computed(() => fund.lastN(props.club.id, expanded.value ? 20 : 3))
const total = computed(() => (fund.historyByClub[props.club.id] ?? []).length)
</script>

<template>
  <article class="relative bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
    <div class="h-1 w-full" :class="accentBar" />
    <div class="p-5 space-y-4">
      <div class="flex items-start gap-4">
        <div class="w-12 h-12 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden shrink-0">
          <img v-if="logoUrl" :src="logoUrl" class="w-full h-full object-cover" alt="" />
          <UIcon v-else name="i-lucide-shield" class="w-5 h-5 text-gray-400" />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="font-heading text-base font-bold truncate">{{ club.name }}</h3>
          <p class="text-xs text-gray-500 truncate">{{ sportLabel }}</p>
        </div>
      </div>

      <div
        class="rounded-card p-4 bg-gradient-to-br"
        :class="fundTierClass"
      >
        <div class="text-xs uppercase tracking-wider opacity-80">{{ t('admin.fund.balance') }}</div>
        <div class="font-heading text-2xl font-bold">{{ fmt(club.fund_balance) }}</div>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <h4 class="text-xs uppercase tracking-wider text-gray-500">{{ t('admin.fund.recent') }}</h4>
          <button
            v-if="total > 3"
            type="button"
            class="text-xs text-brand-primary hover:underline"
            @click="expanded = !expanded"
          >
            {{ expanded ? t('admin.fund.showLess') : t('admin.fund.showMore', { n: total }) }}
          </button>
        </div>
        <div class="mt-2">
          <AdminFundHistory :items="preview" />
        </div>
      </div>

      <div class="flex gap-2 pt-2 border-t border-gray-100 dark:border-sidebar">
        <button
          type="button"
          class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-gold/10 text-brand-gold hover:bg-brand-gold/20 text-sm font-medium"
          @click="$emit('debit', club)"
        >
          <UIcon name="i-lucide-minus" class="w-4 h-4" />
          <span>{{ t('admin.fund.actions.debit') }}</span>
        </button>
        <button
          type="button"
          class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-green/10 text-brand-green hover:bg-brand-green/20 text-sm font-medium"
          @click="$emit('credit', club)"
        >
          <UIcon name="i-lucide-plus" class="w-4 h-4" />
          <span>{{ t('admin.fund.actions.credit') }}</span>
        </button>
      </div>
    </div>
  </article>
</template>
