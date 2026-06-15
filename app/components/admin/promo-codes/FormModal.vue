<script setup lang="ts">
// * Create / edit a promo code. Code and amount are immutable once created.
import {
  usePromoCodesStore,
  type PromoCode,
  type PromoAbsorbsBy,
  type PromoScope,
} from '~/stores/promoCodes'

interface Props {
  modelValue: boolean
  promoCode: PromoCode | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const store = usePromoCodesStore()

const code = ref('')
const amount = ref<number | null>(null)
const minSubtotal = ref<number | null>(null)
const absorbsBy = ref<PromoAbsorbsBy>('intersport')
const validFrom = ref('')
const validUntil = ref('')
const note = ref('')
const scope = ref<PromoScope>('global')
const scopeClubId = ref('')
const scopeProductIds = ref<string[]>([])
const saving = ref(false)
const errorMsg = ref<string | null>(null)

const isEdit = computed(() => !!props.promoCode)

function toDateInput(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 10)
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const p = props.promoCode
    code.value = p?.code ?? ''
    amount.value = p?.amount ?? null
    minSubtotal.value = p?.min_subtotal ?? null
    absorbsBy.value = p?.absorbs_by ?? 'intersport'
    validFrom.value = toDateInput(p?.valid_from ?? null)
    validUntil.value = toDateInput(p?.valid_until ?? null)
    note.value = p?.note ?? ''
    scope.value = p?.scope ?? 'global'
    scopeClubId.value = p?.club_id ?? ''
    scopeProductIds.value = [...(p?.scope_product_ids ?? [])]
    errorMsg.value = null
  },
  { immediate: true },
)

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

// * Build the scope slice of the payload, validating client-side first so the
// *   admin gets an inline message before the round-trip.
function scopePayload() {
  if (scope.value === 'club' && !scopeClubId.value) throw new Error('scope_club_required')
  if (scope.value === 'products' && scopeProductIds.value.length === 0) {
    throw new Error('scope_products_required')
  }
  return {
    scope: scope.value,
    club_id: scope.value === 'global' ? null : scopeClubId.value || null,
    scope_product_ids: scope.value === 'products' ? scopeProductIds.value : [],
  }
}

async function submit() {
  errorMsg.value = null
  saving.value = true
  try {
    const sc = scopePayload()
    if (isEdit.value && props.promoCode) {
      await store.update({
        id: props.promoCode.id,
        min_subtotal: minSubtotal.value,
        absorbs_by: absorbsBy.value,
        valid_from: validFrom.value || null,
        valid_until: validUntil.value || null,
        note: note.value.trim() || null,
        ...sc,
      })
    } else {
      if (!code.value.trim()) throw new Error('invalid_code')
      const amt = Number(amount.value)
      if (!isFinite(amt) || amt <= 0) throw new Error('invalid_amount')
      await store.create({
        code: code.value.trim(),
        amount: amt,
        min_subtotal: minSubtotal.value,
        absorbs_by: absorbsBy.value,
        valid_from: validFrom.value || null,
        valid_until: validUntil.value || null,
        note: note.value.trim() || null,
        ...sc,
      })
    }
    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    const m = err instanceof Error ? err.message : 'unknown'
    if (m === 'code_already_exists') errorMsg.value = t('admin.promo.errors.codeExists')
    else if (m === 'invalid_code') errorMsg.value = t('admin.promo.errors.invalidCode')
    else if (m === 'invalid_amount') errorMsg.value = t('admin.promo.errors.invalidAmount')
    else if (m === 'invalid_min_subtotal') errorMsg.value = t('admin.promo.errors.invalidMin')
    else if (m === 'scope_club_required') errorMsg.value = t('admin.promo.errors.scopeClubRequired')
    else if (m === 'scope_products_required') errorMsg.value = t('admin.promo.errors.scopeProductsRequired')
    else if (m === 'scope_products_multi_club') errorMsg.value = t('admin.promo.errors.scopeMultiClub')
    else errorMsg.value = edgeErrorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
  >
    <div class="w-full max-w-lg bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
      <h3 class="font-heading text-lg font-bold">
        {{ isEdit ? t('admin.promo.editTitle', { code: promoCode?.code ?? '' }) : t('admin.promo.createTitle') }}
      </h3>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.promo.field.code') }}</span>
        <input
          v-model="code"
          type="text"
          :disabled="isEdit"
          maxlength="32"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none font-mono uppercase disabled:opacity-60"
          placeholder="SUMMER2026"
        />
        <p class="text-xs text-gray-500 mt-1">{{ t('admin.promo.field.codeHint') }}</p>
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.promo.field.amount') }}</span>
        <div class="flex items-center gap-2 mt-1">
          <input
            v-model.number="amount"
            type="number"
            min="0.01"
            step="0.01"
            :disabled="isEdit"
            class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none disabled:opacity-60"
          />
          <span class="text-gray-500">€</span>
        </div>
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.promo.field.minSubtotal') }}</span>
        <div class="flex items-center gap-2 mt-1">
          <input
            v-model.number="minSubtotal"
            type="number"
            min="0"
            step="0.01"
            class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
          <span class="text-gray-500">€</span>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('admin.promo.field.minSubtotalHint') }}</p>
      </label>

      <div>
        <span class="text-sm font-medium">{{ t('admin.promo.field.absorbs') }}</span>
        <div class="grid grid-cols-2 gap-2 mt-1">
          <label
            class="flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm"
            :class="absorbsBy === 'intersport' ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-200 dark:border-sidebar'"
          >
            <input type="radio" v-model="absorbsBy" value="intersport" class="accent-brand-primary" />
            {{ t('admin.promo.absorbs.intersport') }}
          </label>
          <label
            class="flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm"
            :class="absorbsBy === 'club' ? 'border-brand-gold bg-brand-gold/5' : 'border-gray-200 dark:border-sidebar'"
          >
            <input type="radio" v-model="absorbsBy" value="club" class="accent-brand-gold" />
            {{ t('admin.promo.absorbs.club') }}
          </label>
        </div>
        <p class="text-xs text-gray-500 mt-1">{{ t('admin.promo.field.absorbsHint') }}</p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.promo.field.validFrom') }}</span>
          <input
            v-model="validFrom"
            type="date"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.promo.field.validUntil') }}</span>
          <input
            v-model="validUntil"
            type="date"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>
      </div>

      <AdminPromoCodesScopeSelector
        v-model:scope="scope"
        v-model:club-id="scopeClubId"
        v-model:product-ids="scopeProductIds"
      />

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.promo.field.note') }}</span>
        <textarea
          v-model="note"
          rows="2"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          :placeholder="t('admin.promo.field.notePlaceholder')"
        />
      </label>

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
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:opacity-90 disabled:opacity-60"
          :disabled="saving"
          @click="submit"
        >
          {{ saving ? t('common.loading') : t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
