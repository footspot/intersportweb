<script setup lang="ts">
// * /admin/promo-codes — admin-only. Two tabs:
// *   - Single codes (existing single-use codes created one by one)
// *   - Batches (auto-generated lots; admin can re-download the PDF)
import { usePromoCodesStore, type PromoCode, type PromoBatch, type PromoScope } from '~/stores/promoCodes'
import { useClubsStore } from '~/stores/clubs'
import { buildPromoBatchPdf, downloadPromoBatchPdf } from '~/composables/usePromoBatchPdf'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t, locale } = useI18n()
const { notifyEdgeError } = useEdgeError()
const supabase = useSupabaseClient()
const promo = usePromoCodesStore()
const clubs = useClubsStore()

const tab = ref<'single' | 'batches'>('single')

const showForm = ref(false)
const editing = ref<PromoCode | null>(null)
const showBatchForm = ref(false)

const confirmOpen = ref(false)
const deleting = ref<PromoCode | null>(null)
const deletingBatch = ref<PromoBatch | null>(null)
const confirmBusy = ref(false)
const pdfBusy = ref<string | null>(null)

await useAsyncData('admin-promo-codes-page', async () => {
  await Promise.all([promo.fetchAll(), promo.fetchBatches(), clubs.fetchAll()])
  return true
})

function openCreate() {
  editing.value = null
  showForm.value = true
}
function openEdit(p: PromoCode) {
  editing.value = p
  showForm.value = true
}
function askDelete(p: PromoCode) {
  deleting.value = p
  deletingBatch.value = null
  confirmOpen.value = true
}
function askDeleteBatch(b: PromoBatch) {
  deletingBatch.value = b
  deleting.value = null
  confirmOpen.value = true
}
async function doDelete() {
  confirmBusy.value = true
  try {
    if (deleting.value) {
      await promo.remove(deleting.value.id)
    } else if (deletingBatch.value) {
      await promo.removeBatch(deletingBatch.value.batch_id)
    }
    confirmOpen.value = false
    deleting.value = null
    deletingBatch.value = null
  } catch (err) {
    // * Surface why the delete was refused (e.g. batch_has_used_codes) as a toast.
    notifyEdgeError(err)
  } finally {
    confirmBusy.value = false
  }
}

function clubName(clubId: string | null): string {
  if (!clubId) return '—'
  return clubs.items.find((c) => c.id === clubId)?.name ?? '—'
}

// * Human label for a code/batch scope, shown in the tables.
function scopeLabel(s: { scope: PromoScope; club_id: string | null; scope_product_ids: string[] }): string {
  if (s.scope === 'club') return clubName(s.club_id)
  if (s.scope === 'products') {
    return t('admin.promo.scope.packLabel', { n: s.scope_product_ids?.length ?? 0, club: clubName(s.club_id) })
  }
  return t('admin.promo.scope.global')
}
function clubLogoUrl(clubId: string | null): string | null {
  const c = clubs.items.find((x) => x.id === clubId)
  if (!c?.logo_path) return null
  const { data } = supabase.storage.from('club-logos').getPublicUrl(c.logo_path)
  return data?.publicUrl ?? null
}

// * Absolute origin for the club-shop deep link baked into the cover QR.
const config = useRuntimeConfig()
function shopOrigin(): string {
  return (
    (config.public.siteUrl as string) ||
    (typeof window !== 'undefined' ? window.location.origin : '') ||
    'https://www.intersportclubidf.com'
  )
}

async function reDownloadPdf(b: PromoBatch) {
  pdfBusy.value = b.batch_id
  try {
    const codes = await promo.fetchBatchCodes(b.batch_id)
    const club = b.club_id ? clubs.items.find((c) => c.id === b.club_id) ?? null : null
    const blob = await buildPromoBatchPdf({
      intersportLogoUrl: '/logo_horizontal.svg',
      clubLogoUrl: clubLogoUrl(b.club_id),
      clubName: club?.name ?? null,
      shopUrl: club ? `${shopOrigin()}/?club=${club.id}` : `${shopOrigin()}/`,
      batchLabel: b.batch_id.slice(0, 8),
      codes: codes.map((c) => c.code),
      amount: Number(b.amount),
      minSubtotal: b.min_subtotal != null ? Number(b.min_subtotal) : null,
      validFrom: fmtDateLong(b.valid_from),
      validUntil: fmtDateLong(b.valid_until),
      absorbsByLabel: t(`admin.promo.absorbs.${b.absorbs_by}`),
      note: b.note,
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
        cover_shop_qr: t('admin.promo.pdf.coverShopQr'),
        voucher_title: t('admin.promo.pdf.voucherTitle'),
        voucher_amount: t('admin.promo.pdf.voucherAmount'),
        voucher_min: t('admin.promo.pdf.voucherMin'),
        voucher_until: t('admin.promo.pdf.voucherUntil'),
        voucher_no_expiry: t('admin.promo.pdf.voucherNoExpiry'),
        voucher_single_use: t('admin.promo.pdf.voucherSingleUse'),
        voucher_club_for: t('admin.promo.pdf.voucherClubFor'),
      },
    })
    const today = new Date(b.created_at).toISOString().slice(0, 10)
    downloadPromoBatchPdf(blob, t('admin.promo.batch.fileName', { date: today }))
  } finally {
    pdfBusy.value = null
  }
}

function fmtEuro(v: number | string | null | undefined) {
  if (v == null || v === '') return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))
}
function fmtDate(v: string | null) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(new Date(v))
}
function fmtDateLong(v: string | null): string | null {
  if (!v) return null
  return new Intl.DateTimeFormat(locale.value === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long' }).format(new Date(v))
}
function statusClass(s: ReturnType<typeof promo.status>) {
  switch (s) {
    case 'active':    return 'bg-brand-green/15 text-brand-green'
    case 'used':      return 'bg-gray-200 text-gray-600 dark:bg-sidebar dark:text-gray-400'
    case 'expired':   return 'bg-brand-secondary/15 text-brand-secondary'
    case 'scheduled': return 'bg-brand-gold/15 text-brand-gold'
  }
}
function batchStatusClass(s: ReturnType<typeof promo.batchStatus>) {
  switch (s) {
    case 'active':           return 'bg-brand-green/15 text-brand-green'
    case 'partially_used':   return 'bg-brand-primary/15 text-brand-primary'
    case 'used_up':          return 'bg-gray-200 text-gray-600 dark:bg-sidebar dark:text-gray-400'
    case 'expired':          return 'bg-brand-secondary/15 text-brand-secondary'
    case 'scheduled':        return 'bg-brand-gold/15 text-brand-gold'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.promo.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.promo.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-primary text-brand-primary text-sm font-medium hover:bg-brand-primary/5"
          @click="showBatchForm = true"
        >
          <UIcon name="i-lucide-layers" class="w-4 h-4" />
          <span>{{ t('admin.promo.newBatch') }}</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
          @click="openCreate"
        >
          <UIcon name="i-lucide-plus" class="w-4 h-4" />
          <span>{{ t('admin.promo.new') }}</span>
        </button>
      </div>
    </div>

    <!-- * Tabs * -->
    <div class="flex gap-1 border-b border-gray-200 dark:border-sidebar">
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
        :class="tab === 'single' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="tab = 'single'"
      >
        {{ t('admin.promo.tabs.single') }}
        <span class="ml-1 text-xs text-gray-400">({{ promo.items.length }})</span>
      </button>
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
        :class="tab === 'batches' ? 'border-brand-primary text-brand-primary' : 'border-transparent text-gray-500 hover:text-gray-700'"
        @click="tab = 'batches'"
      >
        {{ t('admin.promo.tabs.batches') }}
        <span class="ml-1 text-xs text-gray-400">({{ promo.batches.length }})</span>
      </button>
    </div>

    <!-- * Single codes table * -->
    <div v-show="tab === 'single'" class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="promo.loading" class="p-10 text-center text-gray-500">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="promo.items.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-ticket-percent" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.promo.empty') }}</p>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3">{{ t('admin.promo.col.code') }}</th>
            <th class="px-4 py-3">{{ t('admin.promo.col.amount') }}</th>
            <th class="px-4 py-3">{{ t('admin.promo.col.scope') }}</th>
            <th class="px-4 py-3">{{ t('admin.promo.col.absorbs') }}</th>
            <th class="px-4 py-3">{{ t('admin.promo.col.window') }}</th>
            <th class="px-4 py-3">{{ t('admin.promo.col.status') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.promo.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in promo.items" :key="p.id" class="border-t border-gray-100 dark:border-sidebar">
            <td class="px-4 py-3 font-mono font-medium">{{ p.code }}</td>
            <td class="px-4 py-3">
              {{ fmtEuro(p.amount) }}
              <div v-if="p.min_subtotal" class="text-xs text-gray-400">
                {{ t('admin.promo.minSubtotalShort', { v: fmtEuro(p.min_subtotal) }) }}
              </div>
            </td>
            <td class="px-4 py-3 text-xs">
              <span
                class="px-2 py-0.5 rounded-full font-medium"
                :class="p.scope === 'global' ? 'bg-gray-100 text-gray-500 dark:bg-sidebar dark:text-gray-400' : 'bg-brand-primary/10 text-brand-primary'"
              >
                {{ scopeLabel(p) }}
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-gray-600">
              {{ t(`admin.promo.absorbs.${p.absorbs_by}`) }}
            </td>
            <td class="px-4 py-3 text-xs text-gray-500">
              <div>{{ t('admin.promo.from') }}: {{ fmtDate(p.valid_from) }}</div>
              <div>{{ t('admin.promo.until') }}: {{ fmtDate(p.valid_until) }}</div>
            </td>
            <td class="px-4 py-3">
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusClass(promo.status(p))">
                {{ t(`admin.promo.status.${promo.status(p)}`) }}
              </span>
              <div v-if="p.used_at && p.used_by_email" class="text-xs text-gray-400 mt-1">
                {{ p.used_by_email }}
              </div>
            </td>
            <td class="px-4 py-3 text-right space-x-1">
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="!!p.used_at"
                @click="openEdit(p)"
              >
                <UIcon name="i-lucide-pencil" class="w-4 h-4" />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="!!p.used_at"
                @click="askDelete(p)"
              >
                <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- * Batches table * -->
    <div v-show="tab === 'batches'" class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="promo.loadingBatches" class="p-10 text-center text-gray-500">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="promo.batches.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-layers" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.promo.batch.empty') }}</p>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3">{{ t('admin.promo.batch.col.createdAt') }}</th>
            <th class="px-4 py-3">{{ t('admin.promo.batch.col.count') }}</th>
            <th class="px-4 py-3">{{ t('admin.promo.batch.col.amount') }}</th>
            <th class="px-4 py-3">{{ t('admin.promo.col.scope') }}</th>
            <th class="px-4 py-3">{{ t('admin.promo.batch.col.window') }}</th>
            <th class="px-4 py-3">{{ t('admin.promo.batch.col.status') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.promo.batch.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in promo.batches" :key="b.batch_id" class="border-t border-gray-100 dark:border-sidebar">
            <td class="px-4 py-3 text-xs text-gray-500">
              <div>{{ fmtDate(b.created_at) }}</div>
              <div class="font-mono text-[10px] text-gray-400">{{ b.batch_id.slice(0, 8) }}</div>
            </td>
            <td class="px-4 py-3">
              <span class="font-medium">{{ b.used_count }} / {{ b.count }}</span>
            </td>
            <td class="px-4 py-3">
              {{ fmtEuro(b.amount) }}
              <div v-if="b.min_subtotal" class="text-xs text-gray-400">
                {{ t('admin.promo.minSubtotalShort', { v: fmtEuro(b.min_subtotal) }) }}
              </div>
            </td>
            <td class="px-4 py-3 text-xs">
              <span
                class="px-2 py-0.5 rounded-full font-medium"
                :class="b.scope === 'global' ? 'bg-gray-100 text-gray-500 dark:bg-sidebar dark:text-gray-400' : 'bg-brand-primary/10 text-brand-primary'"
              >
                {{ scopeLabel(b) }}
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-gray-500">
              <div>{{ t('admin.promo.from') }}: {{ fmtDate(b.valid_from) }}</div>
              <div>{{ t('admin.promo.until') }}: {{ fmtDate(b.valid_until) }}</div>
            </td>
            <td class="px-4 py-3">
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="batchStatusClass(promo.batchStatus(b))">
                {{ t(`admin.promo.batch.status.${promo.batchStatus(b)}`) }}
              </span>
            </td>
            <td class="px-4 py-3 text-right space-x-1">
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar disabled:opacity-30"
                :disabled="pdfBusy === b.batch_id"
                :title="t('admin.promo.batch.downloadPdf')"
                @click="reDownloadPdf(b)"
              >
                <UIcon
                  :name="pdfBusy === b.batch_id ? 'i-lucide-loader-2' : 'i-lucide-file-down'"
                  class="w-4 h-4"
                  :class="pdfBusy === b.batch_id ? 'animate-spin' : ''"
                />
              </button>
              <button
                type="button"
                class="p-2 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="b.used_count > 0"
                @click="askDeleteBatch(b)"
              >
                <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <AdminPromoCodesFormModal
      v-model="showForm"
      :promo-code="editing"
      @saved="promo.fetchAll()"
    />
    <AdminPromoCodesBatchModal
      v-model="showBatchForm"
      @saved="promo.fetchBatches()"
    />
    <AdminConfirmDialog
      v-model="confirmOpen"
      :title="deletingBatch ? t('admin.promo.batch.deleteTitle') : t('admin.promo.deleteTitle')"
      :message="
        deletingBatch
          ? t('admin.promo.batch.deleteConfirm', { count: deletingBatch.count })
          : t('admin.promo.deleteConfirm', { code: deleting?.code ?? '' })
      "
      :busy="confirmBusy"
      @confirm="doDelete"
    />
  </div>
</template>
