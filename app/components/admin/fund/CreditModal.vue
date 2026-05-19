<script setup lang="ts">
import type { Club } from '~/stores/clubs'
import { useFundStore } from '~/stores/fund'

interface Props {
  modelValue: boolean
  club: Club | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const fund = useFundStore()

const amount = ref(0)
const reason = ref('')
const reference = ref('')
const saving = ref(false)
const errorMsg = ref<string | null>(null)

const reasonOptions = computed(() => [
  t('admin.fund.credit.reasons.annual'),
  t('admin.fund.credit.reasons.bonus'),
  t('admin.fund.credit.reasons.correction'),
  t('admin.fund.credit.reasons.refund'),
  t('admin.fund.credit.reasons.other'),
])

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    amount.value = 0
    reason.value = reasonOptions.value[0]
    reference.value = ''
    errorMsg.value = null
  },
  { immediate: true },
)

function fmt(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

const currentBalance = computed(() => Number(props.club?.fund_balance ?? 0))
const nextBalance = computed(() => currentBalance.value + (Number(amount.value) || 0))

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

async function save() {
  if (!props.club) return
  errorMsg.value = null
  const a = Number(amount.value)
  if (!Number.isFinite(a) || a <= 0) {
    errorMsg.value = t('admin.fund.errors.amountPositive')
    return
  }
  if (!reason.value.trim()) {
    errorMsg.value = t('admin.fund.errors.reasonRequired')
    return
  }
  saving.value = true
  try {
    await fund.credit(props.club.id, a, reason.value.trim(), reference.value.trim() || undefined)
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
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-md bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4">
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-green/10 text-brand-green">
          <UIcon name="i-lucide-plus-circle" class="w-5 h-5" />
        </span>
        <div>
          <h3 class="font-heading text-lg font-bold">
            {{ t('admin.fund.credit.title') }}
          </h3>
          <p class="text-xs text-gray-500">{{ club?.name }}</p>
        </div>
      </div>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.fund.amount') }}</span>
        <div class="flex items-center gap-2 mt-1">
          <input
            v-model.number="amount"
            type="number"
            min="0"
            step="0.01"
            class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-green focus:outline-none"
          />
          <span class="text-gray-500">€</span>
        </div>
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.fund.reason') }}</span>
        <select
          v-model="reason"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-white dark:bg-sidebar-surface focus:ring-2 focus:ring-brand-green focus:outline-none"
        >
          <option v-for="r in reasonOptions" :key="r" :value="r">{{ r }}</option>
        </select>
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.fund.reference') }}</span>
        <input
          v-model="reference"
          type="text"
          :placeholder="t('admin.fund.referencePlaceholder')"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-green focus:outline-none"
        />
      </label>

      <!-- Before / after preview -->
      <div class="grid grid-cols-3 items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-sidebar text-sm">
        <div>
          <div class="text-xs text-gray-500">{{ t('admin.fund.before') }}</div>
          <div class="font-medium">{{ fmt(currentBalance) }}</div>
        </div>
        <div class="text-center text-brand-green">
          <UIcon name="i-lucide-arrow-right" class="w-5 h-5 mx-auto" />
          <div class="text-xs mt-1">+{{ fmt(Number(amount) || 0) }}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-gray-500">{{ t('admin.fund.after') }}</div>
          <div class="font-heading text-brand-green font-bold">{{ fmt(nextBalance) }}</div>
        </div>
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
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-green text-white hover:opacity-90 disabled:opacity-60"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? t('common.loading') : t('admin.fund.credit.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>
