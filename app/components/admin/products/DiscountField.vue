<script setup lang="ts">
// * Discount input — percent slider + source radio. Source is required when percent > 0.
import type { DiscountSource } from '~/composables/usePricingPreview'

interface Props {
  percent: number
  source: DiscountSource
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:percent', v: number): void
  (e: 'update:source', v: DiscountSource): void
}>()

const { t } = useI18n()

const pct = computed({
  get: () => props.percent,
  set: (v) => {
    const next = Math.max(0, Math.min(100, Number(v) || 0))
    emit('update:percent', next)
    if (next === 0) emit('update:source', null)
    else if (!props.source) emit('update:source', 'club')
  },
})

function pick(src: 'club' | 'intersport') {
  emit('update:source', src)
}
</script>

<template>
  <div class="space-y-3">
    <label class="block">
      <span class="text-sm font-medium">{{ t('admin.products.discount.percent') }}</span>
      <div class="flex items-center gap-3 mt-1">
        <input
          v-model.number="pct"
          type="number"
          min="0"
          max="100"
          step="0.5"
          class="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
        <span class="text-gray-500">%</span>
      </div>
    </label>

    <div v-if="pct > 0">
      <span class="text-sm font-medium">{{ t('admin.products.discount.source') }}</span>
      <div class="grid grid-cols-2 gap-2 mt-1">
        <button
          type="button"
          class="px-3 py-2 rounded-lg border text-sm font-medium text-left"
          :class="source === 'club' ? 'border-brand-gold bg-brand-gold/10 text-brand-gold' : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
          @click="pick('club')"
        >
          <div class="font-semibold">{{ t('admin.products.discount.club') }}</div>
          <div class="text-xs text-gray-500">{{ t('admin.products.discount.clubHint') }}</div>
        </button>
        <button
          type="button"
          class="px-3 py-2 rounded-lg border text-sm font-medium text-left"
          :class="source === 'intersport' ? 'border-brand-purple bg-brand-purple/10 text-brand-purple' : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
          @click="pick('intersport')"
        >
          <div class="font-semibold">{{ t('admin.products.discount.intersport') }}</div>
          <div class="text-xs text-gray-500">{{ t('admin.products.discount.intersportHint') }}</div>
        </button>
      </div>
    </div>
  </div>
</template>
