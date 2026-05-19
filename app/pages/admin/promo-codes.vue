<script setup lang="ts">
// * /admin/promo-codes — admin-only. Manages single-use promo codes.
import { usePromoCodesStore, type PromoCode } from '~/stores/promoCodes'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t } = useI18n()
const promo = usePromoCodesStore()

const showForm = ref(false)
const editing = ref<PromoCode | null>(null)
const confirmOpen = ref(false)
const deleting = ref<PromoCode | null>(null)
const confirmBusy = ref(false)

await useAsyncData('admin-promo-codes-page', async () => { await promo.fetchAll(); return true })

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
  confirmOpen.value = true
}
async function doDelete() {
  if (!deleting.value) return
  confirmBusy.value = true
  try {
    await promo.remove(deleting.value.id)
    confirmOpen.value = false
    deleting.value = null
  } finally {
    confirmBusy.value = false
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
function statusClass(s: ReturnType<typeof promo.status>) {
  switch (s) {
    case 'active':    return 'bg-brand-green/15 text-brand-green'
    case 'used':      return 'bg-gray-200 text-gray-600 dark:bg-sidebar dark:text-gray-400'
    case 'expired':   return 'bg-brand-secondary/15 text-brand-secondary'
    case 'scheduled': return 'bg-brand-gold/15 text-brand-gold'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.promo.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.promo.subtitle') }}</p>
      </div>
      <button
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
        @click="openCreate"
      >
        <UIcon name="i-lucide-plus" class="w-4 h-4" />
        <span>{{ t('admin.promo.new') }}</span>
      </button>
    </div>

    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
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

    <AdminPromoCodesFormModal
      v-model="showForm"
      :promo-code="editing"
      @saved="promo.fetchAll()"
    />
    <AdminConfirmDialog
      v-model="confirmOpen"
      :title="t('admin.promo.deleteTitle')"
      :message="t('admin.promo.deleteConfirm', { code: deleting?.code ?? '' })"
      :busy="confirmBusy"
      @confirm="doDelete"
    />
  </div>
</template>
