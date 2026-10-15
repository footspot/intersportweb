<script setup lang="ts">
// * Codes inside one batch with who used each one. Clicking a code hands it
// * to the page's CodeLookup for the full order history.
import { usePromoCodesStore, type PromoBatch, type PromoCode } from '~/stores/promoCodes'
import { useClubsStore } from '~/stores/clubs'
import { buildPromoUsagePdf, downloadPromoUsagePdf } from '~/composables/usePromoUsagePdf'
import { fileSlug } from '~/composables/usePdfDoc'

interface Props {
  modelValue: boolean
  batch: PromoBatch | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'check', code: string): void
}>()

const { t } = useI18n()
const promo = usePromoCodesStore()
const clubs = useClubsStore()
const supabase = useSupabaseClient()

const codes = ref<PromoCode[]>([])
const loading = ref(false)
const errorMsg = ref<string | null>(null)
const filter = ref<'all' | 'used' | 'unused'>('all')
const search = ref('')

watch(
  () => [props.modelValue, props.batch?.batch_id],
  async () => {
    if (!props.modelValue || !props.batch) return
    loading.value = true
    errorMsg.value = null
    filter.value = 'all'
    search.value = ''
    try {
      codes.value = await promo.fetchBatchCodes(props.batch.batch_id)
    } catch {
      codes.value = []
      errorMsg.value = t('admin.promo.lookup.failed')
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return codes.value.filter((c) => {
    if (filter.value === 'used' && !c.used_at) return false
    if (filter.value === 'unused' && c.used_at) return false
    if (!q) return true
    return c.code.toLowerCase().includes(q) || (c.used_by_email ?? '').toLowerCase().includes(q)
  })
})
const usedCount = computed(() => codes.value.filter((c) => c.used_at).length)

function close() {
  emit('update:modelValue', false)
}
function check(code: string) {
  emit('check', code)
  close()
}

function fmtDateTime(v: string | null) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v))
}
function fmtDate(v: string | null): string | null {
  if (!v) return null
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(v))
}

// ────────────────────────────── PDF export ──────────────────────────────────
// * Clubs ask which of their codes have been redeemed. The report is built from
// * the codes already fetched for this modal, so it can never disagree with the
// * table on screen.
// *
// * ! Customer e-mails are personal data; handing them to a club is a disclosure
// * ! to a third party. The column is therefore opt-in per export and omitted
// * ! entirely — not masked — when the box is unticked.
const includeEmails = ref(true)
const pdfBusy = ref(false)

function clubName(id: string | null): string | null {
  if (!id) return null
  return clubs.items.find((c) => c.id === id)?.name ?? null
}
function clubLogoUrl(id: string | null): string | null {
  const c = clubs.items.find((x) => x.id === id)
  if (!c?.logo_path) return null
  const { data } = supabase.storage.from('club-logos').getPublicUrl(c.logo_path)
  return data?.publicUrl ?? null
}
function scopeLabel(b: PromoBatch): string {
  if (b.scope === 'club') return t('admin.promo.scope.club') + ' - ' + (clubName(b.club_id) ?? '—')
  if (b.scope === 'products') {
    return t('admin.promo.scope.packLabel', {
      n: b.scope_product_ids?.length ?? 0,
      club: clubName(b.club_id) ?? '—',
    })
  }
  return t('admin.promo.scope.global')
}

// * Printed in the report so a filtered export is never mistaken for the batch.
const filterLabel = computed<string | null>(() => {
  const parts: string[] = []
  if (filter.value !== 'all') {
    parts.push(filter.value === 'used'
      ? t('admin.promo.batchCodes.filterUsed')
      : t('admin.promo.batchCodes.filterUnused'))
  }
  if (search.value.trim()) parts.push(`"${search.value.trim()}"`)
  return parts.length ? parts.join(' - ') : null
})

async function exportPdf() {
  const b = props.batch
  if (!b) return
  pdfBusy.value = true
  errorMsg.value = null
  try {
    const blob = await buildPromoUsagePdf({
      intersportLogoUrl: '/logo_horizontal.svg',
      clubLogoUrl: clubLogoUrl(b.club_id),
      clubName: clubName(b.club_id),
      batchLabel: b.batch_id.slice(0, 8),
      scopeLabel: scopeLabel(b),
      amount: Number(b.amount),
      minSubtotal: b.min_subtotal != null ? Number(b.min_subtotal) : null,
      validFromLabel: fmtDate(b.valid_from),
      validUntilLabel: fmtDate(b.valid_until),
      absorbsLabel: t(`admin.promo.absorbs.${b.absorbs_by}`),
      note: b.note,
      createdAtLabel: fmtDate(b.created_at) ?? '—',
      generatedAtLabel: new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'long',
        timeStyle: 'short',
      }).format(new Date()),
      filterLabel: filterLabel.value,
      includeEmails: includeEmails.value,
      // * Rows follow what is on screen; totals below stay batch-wide.
      codes: visible.value.map((c) => ({
        code: c.code,
        usedAtLabel: c.used_at ? fmtDateTime(c.used_at) : null,
        email: c.used_by_email,
      })),
      totals: { issued: codes.value.length, used: usedCount.value },
      i18n: {
        title: t('admin.promo.usagePdf.title'),
        allClubs: t('admin.promo.usagePdf.allClubs'),
        batch: t('admin.promo.usagePdf.batch'),
        scope: t('admin.promo.col.scope'),
        value: t('admin.promo.pdf.coverAmount'),
        minSubtotal: t('admin.promo.pdf.coverMin'),
        validity: t('admin.promo.col.window'),
        absorbs: t('admin.promo.col.absorbs'),
        note: t('admin.promo.pdf.coverNote'),
        createdAt: t('admin.promo.usagePdf.createdAt'),
        generatedAt: t('admin.promo.usagePdf.generatedAt'),
        filter: t('admin.promo.usagePdf.filter'),
        unlimited: t('admin.promo.pdf.coverUnlimited'),
        none: t('admin.promo.usagePdf.none'),
        cardIssued: t('admin.promo.usagePdf.cardIssued'),
        cardUsed: t('admin.promo.usagePdf.cardUsed'),
        cardRemaining: t('admin.promo.usagePdf.cardRemaining'),
        cardValueIssued: t('admin.promo.usagePdf.cardValueIssued'),
        cardValueUsed: t('admin.promo.usagePdf.cardValueUsed'),
        cardValueRemaining: t('admin.promo.usagePdf.cardValueRemaining'),
        tableTitle: t('admin.promo.usagePdf.tableTitle'),
        colCode: t('admin.promo.col.code'),
        colStatus: t('admin.promo.col.status'),
        colUsedAt: t('admin.promo.batchCodes.usedAt'),
        colUsedBy: t('admin.promo.batchCodes.usedBy'),
        statusUsed: t('admin.promo.usagePdf.statusUsed'),
        statusUnused: t('admin.promo.batchCodes.unused'),
        emailsOmitted: t('admin.promo.usagePdf.emailsOmitted'),
        noData: t('admin.promo.batchCodes.empty'),
        page: t('admin.promo.usagePdf.page'),
        confidential: t('admin.promo.usagePdf.confidential'),
      },
    })
    downloadPromoUsagePdf(
      blob,
      `codes-promo-${fileSlug(clubName(b.club_id) ?? 'global')}-${b.batch_id.slice(0, 8)}.pdf`,
    )
  } catch {
    errorMsg.value = t('admin.promo.lookup.failed')
  } finally {
    pdfBusy.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-3xl bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4 max-h-[90vh] flex flex-col">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-heading text-lg font-bold">
            {{ t('admin.promo.batchCodes.title', { id: batch?.batch_id.slice(0, 8) ?? '' }) }}
          </h3>
          <p v-if="!loading" class="text-sm text-gray-500">
            {{ t('admin.promo.batchCodes.summary', { used: usedCount, total: codes.length }) }}
          </p>
        </div>
        <button type="button" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar" @click="close">
          <UIcon name="i-lucide-x" class="w-4 h-4" />
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <input
          v-model="search"
          type="text"
          class="flex-1 min-w-[12rem] px-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-transparent text-sm"
          :placeholder="t('admin.promo.batchCodes.search')"
        >
        <select
          v-model="filter"
          class="px-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-transparent text-sm"
        >
          <option value="all">{{ t('admin.promo.batchCodes.filterAll') }}</option>
          <option value="used">{{ t('admin.promo.batchCodes.filterUsed') }}</option>
          <option value="unused">{{ t('admin.promo.batchCodes.filterUnused') }}</option>
        </select>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="loading || pdfBusy || codes.length === 0"
          @click="exportPdf"
        >
          <UIcon name="i-lucide-file-down" class="w-4 h-4" />
          {{ pdfBusy ? t('admin.promo.usagePdf.building') : t('admin.promo.usagePdf.download') }}
        </button>
      </div>

      <!-- ! Customer e-mails are personal data: handing them to a club is a
           disclosure to a third party, so make it a deliberate per-export choice. -->
      <label class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <input v-model="includeEmails" type="checkbox" class="rounded border-gray-300">
        {{ t('admin.promo.usagePdf.includeEmails') }}
      </label>

      <div class="overflow-auto flex-1 -mx-6 px-6">
        <p v-if="loading" class="py-8 text-center text-gray-500">{{ t('common.loading') }}</p>
        <p v-else-if="errorMsg" class="py-8 text-center text-brand-secondary">{{ errorMsg }}</p>
        <p v-else-if="visible.length === 0" class="py-8 text-center text-gray-500">
          {{ t('admin.promo.batchCodes.empty') }}
        </p>
        <table v-else class="w-full text-sm">
          <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500 sticky top-0">
            <tr>
              <th class="px-3 py-2">{{ t('admin.promo.col.code') }}</th>
              <th class="px-3 py-2">{{ t('admin.promo.batchCodes.usedAt') }}</th>
              <th class="px-3 py-2">{{ t('admin.promo.batchCodes.usedBy') }}</th>
              <th class="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in visible" :key="c.id" class="border-t border-gray-100 dark:border-sidebar">
              <td class="px-3 py-2 font-mono font-medium">{{ c.code }}</td>
              <td class="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                <span v-if="c.used_at">{{ fmtDateTime(c.used_at) }}</span>
                <span v-else class="text-brand-green">{{ t('admin.promo.batchCodes.unused') }}</span>
              </td>
              <td class="px-3 py-2 text-xs">{{ c.used_by_email ?? '—' }}</td>
              <td class="px-3 py-2 text-right">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-xs text-brand-primary hover:underline"
                  @click="check(c.code)"
                >
                  <UIcon name="i-lucide-search-check" class="w-3.5 h-3.5" />
                  {{ t('admin.promo.batchCodes.check') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
