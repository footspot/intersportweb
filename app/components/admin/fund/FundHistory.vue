<script setup lang="ts">
import type { FundTransaction, FundTxType } from '~/stores/fund'

interface Props {
  items: FundTransaction[]
  limit?: number
  showEmpty?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  limit: 0,
  showEmpty: true,
})

const { t, locale } = useI18n()

// * Prefer the product name for auto-sale rows; fall back to the raw reason.
function title(tx: FundTransaction) {
  if (tx.product_name) {
    return tx.product_name[locale.value as 'fr' | 'en'] ?? tx.product_name.fr
  }
  return tx.reason
}

const visible = computed(() =>
  props.limit > 0 ? props.items.slice(0, props.limit) : props.items,
)

function fmt(v: number | string) {
  const n = Number(v ?? 0)
  const sign = n >= 0 ? '+' : ''
  return sign + new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

const TYPE_STYLE: Record<FundTxType, { label: string; classes: string; icon: string }> = {
  auto_sale: { label: 'admin.fund.tx.autoSale', classes: 'text-brand-green bg-brand-green/10', icon: 'i-lucide-arrow-down-right' },
  manual_credit: { label: 'admin.fund.tx.manualCredit', classes: 'text-brand-green bg-brand-green/10', icon: 'i-lucide-plus' },
  manual_debit: { label: 'admin.fund.tx.manualDebit', classes: 'text-brand-gold bg-brand-gold/10', icon: 'i-lucide-minus' },
  refund_reversal: { label: 'admin.fund.tx.refundReversal', classes: 'text-brand-secondary bg-brand-secondary/10', icon: 'i-lucide-rotate-ccw' },
}
</script>

<template>
  <div>
    <div v-if="visible.length === 0 && showEmpty" class="text-xs text-gray-500 italic">
      {{ t('admin.fund.history.empty') }}
    </div>
    <ul v-else class="space-y-1.5">
      <li
        v-for="tx in visible"
        :key="tx.id"
        class="flex items-start gap-2 text-xs"
      >
        <span
          class="inline-flex items-center justify-center w-6 h-6 rounded-full shrink-0"
          :class="TYPE_STYLE[tx.type].classes"
        >
          <UIcon :name="TYPE_STYLE[tx.type].icon" class="w-3 h-3" />
        </span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <span class="font-medium truncate">{{ title(tx) }}</span>
            <span
              class="font-mono font-medium shrink-0"
              :class="Number(tx.amount) >= 0 ? 'text-brand-green' : 'text-brand-secondary'"
            >
              {{ fmt(tx.amount) }}
            </span>
          </div>
          <div class="text-gray-500 dark:text-gray-400 truncate">
            {{ t(TYPE_STYLE[tx.type].label) }} · {{ fmtDate(tx.created_at) }}
            <span v-if="tx.reference"> · {{ tx.reference }}</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
