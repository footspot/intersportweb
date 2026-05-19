<script setup lang="ts">
// * Live pricing preview — shows what the member will pay and what the club
// * earns per unit, including who absorbs the discount.
import { usePricingPreview, type PricingInput } from '~/composables/usePricingPreview'

interface Props {
  input: PricingInput
}
const props = defineProps<Props>()
const { t } = useI18n()

const reactiveInput = computed(() => props.input)
const preview = usePricingPreview(reactiveInput)

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

const absorbingLabel = computed(() => {
  if (preview.value.absorbing_party === 'club') return t('admin.products.preview.absorbedByClub')
  if (preview.value.absorbing_party === 'intersport') return t('admin.products.preview.absorbedByIntersport')
  return t('admin.products.preview.noDiscount')
})
const absorbingClass = computed(() => {
  if (preview.value.absorbing_party === 'club') return 'bg-brand-gold/10 text-brand-gold'
  if (preview.value.absorbing_party === 'intersport') return 'bg-brand-purple/10 text-brand-purple'
  return 'bg-gray-100 dark:bg-sidebar text-gray-500'
})

const fundClass = computed(() =>
  preview.value.club_fund_per_unit > 0
    ? 'text-brand-green'
    : preview.value.club_fund_per_unit < 0
    ? 'text-brand-secondary'
    : 'text-gray-500',
)
</script>

<template>
  <div class="rounded-card bg-gray-50 dark:bg-sidebar p-4 space-y-3">
    <div class="flex items-center justify-between">
      <div class="text-xs uppercase tracking-wider text-gray-500">
        {{ t('admin.products.preview.title') }}
      </div>
      <span class="text-xs px-2 py-0.5 rounded-full" :class="absorbingClass">
        {{ absorbingLabel }}
      </span>
    </div>

    <div class="grid grid-cols-2 gap-3 text-sm">
      <div>
        <div class="text-xs text-gray-500">{{ t('admin.products.preview.memberPays') }}</div>
        <div class="font-heading text-lg font-bold">{{ fmt(preview.unit_price_paid) }}</div>
        <div v-if="preview.member_discount_amount > 0" class="text-xs text-gray-500">
          -{{ fmt(preview.member_discount_amount) }}
        </div>
      </div>
      <div>
        <div class="text-xs text-gray-500">{{ t('admin.products.preview.fundPerUnit') }}</div>
        <div class="font-heading text-lg font-bold" :class="fundClass">
          {{ fmt(preview.club_fund_per_unit) }}
        </div>
        <div class="text-xs text-gray-500">
          {{ t('admin.products.preview.margin') }}: {{ preview.margin_percent.toFixed(1) }}%
        </div>
      </div>
    </div>

    <div class="text-xs text-gray-500 pt-2 border-t border-gray-200 dark:border-sidebar-surface">
      {{ t('admin.products.preview.buyingEffective') }}: {{ fmt(preview.buying_price_effective) }}
    </div>
  </div>
</template>
