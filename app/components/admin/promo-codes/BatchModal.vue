<script setup lang="ts">
// * Generate a batch of auto-generated promo codes, then build a PDF
// * containing a cover page (batch metadata + logos) and one voucher page
// * per code. PDF is built client-side via the usePromoBatchPdf composable.
import {
  usePromoCodesStore,
  type PromoAbsorbsBy,
  type PromoScope,
} from '~/stores/promoCodes'
import { useClubsStore, type Club } from '~/stores/clubs'
import { buildPromoBatchPdf, downloadPromoBatchPdf } from '~/composables/usePromoBatchPdf'

interface Props {
  modelValue: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved'): void
}>()

const { t, locale } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const supabase = useSupabaseClient()
const store = usePromoCodesStore()
const clubs = useClubsStore()

const count = ref<number>(50)
const prefix = ref<string>('INT')
const amount = ref<number | null>(20)
const minSubtotal = ref<number | null>(null)
const absorbsBy = ref<PromoAbsorbsBy>('intersport')
const validFrom = ref('')
const validUntil = ref('')
const note = ref('')
const scope = ref<PromoScope>('global')
const scopeClubId = ref<string>('')
const scopeProductIds = ref<string[]>([])

const saving = ref(false)
const errorMsg = ref<string | null>(null)

// * Live sample so the admin sees what the generated codes will look like.
const sampleCode = computed(() => {
  const p = prefix.value.trim().toUpperCase().replace(/\s+/g, '')
  return p ? `${p}-K7N2X9` : 'K7N2X9'
})

const selectedClub = computed<Club | null>(() => {
  if (!scopeClubId.value) return null
  return clubs.items.find((c) => c.id === scopeClubId.value) ?? null
})

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    // * Lazy-load clubs the first time the modal opens (ScopeSelector also
    // *   loads sports/products on demand).
    if (clubs.items.length === 0) await clubs.fetchAll()
    // * Reset form.
    count.value = 50
    prefix.value = 'INT'
    amount.value = 20
    minSubtotal.value = null
    absorbsBy.value = 'intersport'
    validFrom.value = ''
    validUntil.value = ''
    note.value = ''
    scope.value = 'global'
    scopeClubId.value = ''
    scopeProductIds.value = []
    errorMsg.value = null
  },
)

function close() {
  if (!saving.value) emit('update:modelValue', false)
}

function fmtDateForPdf(iso: string | null): string | null {
  if (!iso) return null
  return new Intl.DateTimeFormat(locale.value === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'long',
  }).format(new Date(iso))
}

function clubLogoUrl(club: Club | null): string | null {
  if (!club?.logo_path) return null
  const { data } = supabase.storage.from('club-logos').getPublicUrl(club.logo_path)
  return data?.publicUrl ?? null
}

async function submit() {
  errorMsg.value = null
  const c = Math.floor(Number(count.value))
  if (!isFinite(c) || c < 1 || c > 1000) {
    errorMsg.value = t('admin.promo.batch.errors.invalidCount')
    return
  }
  const amt = Number(amount.value)
  if (!isFinite(amt) || amt <= 0) {
    errorMsg.value = t('admin.promo.errors.invalidAmount')
    return
  }
  const min = minSubtotal.value != null && (minSubtotal.value as unknown as string) !== '' ? Number(minSubtotal.value) : null
  if (min != null && (!isFinite(min) || min < amt)) {
    errorMsg.value = t('admin.promo.errors.invalidMin')
    return
  }
  // * Scope guards (mirrors the edge function so the admin sees it inline).
  if (scope.value === 'club' && !scopeClubId.value) {
    errorMsg.value = t('admin.promo.errors.scopeClubRequired')
    return
  }
  if (scope.value === 'products' && scopeProductIds.value.length === 0) {
    errorMsg.value = t('admin.promo.errors.scopeProductsRequired')
    return
  }

  saving.value = true
  try {
    const created = await store.createBatch({
      count: c,
      prefix: prefix.value.trim(),
      amount: amt,
      min_subtotal: min,
      absorbs_by: absorbsBy.value,
      valid_from: validFrom.value || null,
      valid_until: validUntil.value || null,
      note: note.value.trim() || null,
      club_id: scope.value === 'global' ? null : scopeClubId.value || null,
      scope: scope.value,
      scope_product_ids: scope.value === 'products' ? scopeProductIds.value : [],
    })

    // * Build + download the PDF before closing.
    const club = selectedClub.value
    const blob = await buildPromoBatchPdf({
      intersportLogoUrl: '/logo_horizontal.svg',
      clubLogoUrl: clubLogoUrl(club),
      clubName: club?.name ?? null,
      batchLabel: created.batch_id.slice(0, 8),
      codes: created.items.map((p) => p.code),
      amount: amt,
      minSubtotal: min,
      validFrom: fmtDateForPdf(validFrom.value || null),
      validUntil: fmtDateForPdf(validUntil.value || null),
      absorbsByLabel: t(`admin.promo.absorbs.${absorbsBy.value}`),
      note: note.value.trim() || null,
      i18n: {
        cover_title: t('admin.promo.pdf.coverTitle'),
        cover_count: t('admin.promo.pdf.coverCount'),
        cover_amount: t('admin.promo.pdf.coverAmount'),
        cover_min: t('admin.promo.pdf.coverMin'),
        cover_from: t('admin.promo.pdf.coverFrom'),
        cover_until: t('admin.promo.pdf.coverUntil'),
        cover_absorbs: t('admin.promo.pdf.coverAbsorbs'),
        cover_note: t('admin.promo.pdf.coverNote'),
        cover_unlimited: t('admin.promo.pdf.coverUnlimited'),
        voucher_title: t('admin.promo.pdf.voucherTitle'),
        voucher_amount: t('admin.promo.pdf.voucherAmount'),
        voucher_min: t('admin.promo.pdf.voucherMin'),
        voucher_until: t('admin.promo.pdf.voucherUntil'),
        voucher_no_expiry: t('admin.promo.pdf.voucherNoExpiry'),
        voucher_single_use: t('admin.promo.pdf.voucherSingleUse'),
        voucher_club_for: t('admin.promo.pdf.voucherClubFor'),
      },
    })

    const today = new Date().toISOString().slice(0, 10)
    downloadPromoBatchPdf(blob, t('admin.promo.batch.fileName', { date: today }))

    emit('saved')
    emit('update:modelValue', false)
  } catch (err) {
    const m = err instanceof Error ? err.message : 'unknown'
    if (m === 'invalid_count') errorMsg.value = t('admin.promo.batch.errors.invalidCount')
    else if (m === 'invalid_prefix') errorMsg.value = t('admin.promo.batch.errors.invalidPrefix')
    else if (m === 'invalid_amount') errorMsg.value = t('admin.promo.errors.invalidAmount')
    else if (m === 'invalid_min_subtotal') errorMsg.value = t('admin.promo.errors.invalidMin')
    else if (m === 'code_collision_retry_exhausted') errorMsg.value = t('admin.promo.batch.errors.collisionRetry')
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
    <div class="w-full max-w-2xl bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4 max-h-[92vh] overflow-y-auto">
      <div>
        <h3 class="font-heading text-lg font-bold">{{ t('admin.promo.batch.createTitle') }}</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {{ t('admin.promo.batch.createSubtitle', { prefix: prefix.trim() || '*' }) }}
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.promo.batch.count') }}</span>
          <input
            v-model.number="count"
            type="number"
            min="1"
            max="1000"
            step="1"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
          <p class="text-xs text-gray-500 mt-1">{{ t('admin.promo.batch.countHint') }}</p>
        </label>

        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.promo.batch.prefix') }}</span>
          <input
            v-model="prefix"
            type="text"
            maxlength="16"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none font-mono uppercase"
            placeholder="INT"
          />
          <p class="text-xs text-gray-500 mt-1 font-mono">{{ t('admin.promo.batch.preview', { sample: sampleCode }) }}</p>
        </label>
      </div>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.promo.field.amount') }}</span>
        <div class="flex items-center gap-2 mt-1">
          <input
            v-model.number="amount"
            type="number"
            min="0.01"
            step="0.01"
            class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
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

      <AdminPromoCodesScopeSelector
        v-model:scope="scope"
        v-model:club-id="scopeClubId"
        v-model:product-ids="scopeProductIds"
      />

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
          class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:opacity-90 disabled:opacity-60 inline-flex items-center gap-2"
          :disabled="saving"
          @click="submit"
        >
          <UIcon v-if="!saving" name="i-lucide-file-down" class="w-4 h-4" />
          <UIcon v-else name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          {{ saving ? t('admin.promo.batch.submitting') : t('admin.promo.batch.submit') }}
        </button>
      </div>
    </div>
  </div>
</template>
