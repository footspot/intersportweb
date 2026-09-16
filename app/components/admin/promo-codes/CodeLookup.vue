<script setup lang="ts">
// * Support check for customer disputes ("my code doesn't work").
// *
// * Code → verdict (used / valid / expired / scheduled / unknown), the
// *   redeeming order with the customer's identity, every other order that
// *   carried the code (abandoned, unpaid, refunded race loss), and for an
// *   unused code the conditions that make validation refuse it.
// * Email → every code that customer redeemed or tried.
// * Batch codes are covered too — the tables on this page only list singles.
import {
  usePromoCodesStore,
  type PromoCode,
  type PromoLookupOrder,
  type PromoLookupResult,
} from '~/stores/promoCodes'
import { useClubsStore } from '~/stores/clubs'

const { t } = useI18n()
const promo = usePromoCodesStore()
const clubs = useClubsStore()

const query = ref('')
const busy = ref(false)
const errorMsg = ref<string | null>(null)
const result = ref<PromoLookupResult | null>(null)

const detailOpen = ref(false)
const detailId = ref<string | null>(null)

async function run(q?: string) {
  if (q !== undefined) query.value = q
  const value = query.value.trim()
  if (value.length < 3) {
    errorMsg.value = t('admin.promo.lookup.tooShort')
    return
  }
  busy.value = true
  errorMsg.value = null
  try {
    result.value = await promo.lookup(value)
  } catch {
    result.value = null
    errorMsg.value = t('admin.promo.lookup.failed')
  } finally {
    busy.value = false
  }
}

function clear() {
  query.value = ''
  result.value = null
  errorMsg.value = null
}

function openOrder(id: string) {
  detailId.value = id
  detailOpen.value = true
}

defineExpose({ run })

// * The order that actually consumed the code, if any.
function redeemingOrder(p: PromoCode, orders: PromoLookupOrder[]) {
  return p.used_by_order_id ? orders.find((o) => o.id === p.used_by_order_id) ?? null : null
}

function clubName(clubId: string | null) {
  if (!clubId) return '—'
  return clubs.items.find((c) => c.id === clubId)?.name ?? '—'
}
function scopeText(p: PromoCode) {
  if (p.scope === 'club') return t('admin.promo.lookup.scopeClub', { club: clubName(p.club_id) })
  if (p.scope === 'products') {
    return t('admin.promo.lookup.scopeProducts', { n: p.scope_product_ids?.length ?? 0, club: clubName(p.club_id) })
  }
  return t('admin.promo.lookup.scopeGlobal')
}

function fmtEuro(v: number | string | null | undefined) {
  if (v == null || v === '') return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(v))
}
function fmtDateTime(v: string | null) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v))
}

function statusClass(s: ReturnType<typeof promo.status>) {
  switch (s) {
    case 'active':    return 'bg-brand-green/15 text-brand-green'
    case 'used':      return 'bg-gray-200 text-gray-600 dark:bg-sidebar dark:text-gray-400'
    case 'expired':   return 'bg-brand-secondary/15 text-brand-secondary'
    case 'scheduled': return 'bg-brand-gold/15 text-brand-gold'
  }
}

// * Paid-and-kept orders vs. orders where the customer got nothing out of it.
const SETTLED = new Set(['paid', 'shipped', 'delivered', 'awaiting_pickup', 'picked_up', 'partially_refunded'])
function orderClass(o: PromoLookupOrder) {
  return SETTLED.has(o.status)
    ? 'bg-brand-green/15 text-brand-green'
    : 'bg-gray-200 text-gray-600 dark:bg-sidebar dark:text-gray-400'
}
function orderStatusLabel(o: PromoLookupOrder) {
  const key = `admin.orders.status.${o.status}`
  const label = t(key)
  return label === key ? o.status : label
}
</script>

<template>
  <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-4 space-y-4">
    <div>
      <h2 class="font-heading text-lg font-bold flex items-center gap-2">
        <UIcon name="i-lucide-search-check" class="w-5 h-5 text-brand-primary" />
        {{ t('admin.promo.lookup.title') }}
      </h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.promo.lookup.subtitle') }}</p>
    </div>

    <form class="flex flex-wrap gap-2" @submit.prevent="run()">
      <div class="relative flex-1 min-w-[16rem]">
        <input
          v-model="query"
          type="text"
          autocomplete="off"
          spellcheck="false"
          class="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-sidebar bg-white dark:bg-sidebar text-sm font-mono"
          :placeholder="t('admin.promo.lookup.placeholder')"
        >
        <UIcon name="i-lucide-search" class="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
      </div>
      <button
        type="submit"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
        :disabled="busy"
      >
        <UIcon :name="busy ? 'i-lucide-loader-2' : 'i-lucide-search'" class="w-4 h-4" :class="busy ? 'animate-spin' : ''" />
        {{ t('admin.promo.lookup.submit') }}
      </button>
      <button
        v-if="result || errorMsg"
        type="button"
        class="px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-sidebar"
        @click="clear"
      >
        {{ t('admin.promo.lookup.clear') }}
      </button>
    </form>

    <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

    <!-- * ───────────── Code mode ───────────── * -->
    <template v-if="result && result.mode === 'code'">
      <!-- * Unknown code * -->
      <div v-if="!result.promo" class="rounded-lg border border-brand-secondary/30 bg-brand-secondary/5 p-4 text-sm space-y-2">
        <p class="font-medium text-brand-secondary">
          {{ t('admin.promo.lookup.unknown', { code: result.query }) }}
        </p>
        <p class="text-gray-600 dark:text-gray-300">{{ t('admin.promo.lookup.unknownHint') }}</p>
        <div v-if="result.suggestions.length" class="flex flex-wrap items-center gap-2">
          <span class="text-xs text-gray-500">{{ t('admin.promo.lookup.didYouMean') }}</span>
          <button
            v-for="s in result.suggestions"
            :key="s"
            type="button"
            class="font-mono text-xs px-2 py-1 rounded bg-white dark:bg-sidebar border border-gray-200 dark:border-sidebar hover:border-brand-primary"
            @click="run(s)"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <div v-else class="space-y-4">
        <!-- * Verdict * -->
        <div class="rounded-lg border border-gray-200 dark:border-sidebar p-4 space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <span class="font-mono text-lg font-bold">{{ result.promo.code }}</span>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusClass(promo.status(result.promo))">
              {{ t(`admin.promo.status.${promo.status(result.promo)}`) }}
            </span>
            <span class="text-sm text-gray-500">{{ fmtEuro(result.promo.amount) }}</span>
          </div>

          <!-- * Used: who, when, which order * -->
          <template v-if="result.promo.used_at">
            <p class="text-sm">
              <i18n-t keypath="admin.promo.lookup.usedVerdict" tag="span">
                <template #date><strong>{{ fmtDateTime(result.promo.used_at) }}</strong></template>
                <template #email><strong>{{ result.promo.used_by_email ?? '—' }}</strong></template>
              </i18n-t>
            </p>
            <div
              v-if="redeemingOrder(result.promo, result.orders)"
              class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm rounded-lg bg-gray-50 dark:bg-sidebar px-3 py-2"
            >
              <button
                type="button"
                class="font-mono font-medium text-brand-primary hover:underline"
                @click="openOrder(redeemingOrder(result.promo, result.orders)!.id)"
              >
                {{ redeemingOrder(result.promo, result.orders)!.order_number }}
              </button>
              <span>{{ redeemingOrder(result.promo, result.orders)!.name ?? '—' }}</span>
              <span v-if="redeemingOrder(result.promo, result.orders)!.phone" class="text-gray-500">
                {{ redeemingOrder(result.promo, result.orders)!.phone }}
              </span>
              <span
                class="text-xs px-2 py-0.5 rounded-full font-medium"
                :class="orderClass(redeemingOrder(result.promo, result.orders)!)"
              >
                {{ orderStatusLabel(redeemingOrder(result.promo, result.orders)!) }}
              </span>
            </div>
            <p v-else class="text-xs text-gray-500">{{ t('admin.promo.lookup.orderDeleted') }}</p>
            <p class="text-xs text-gray-500">{{ t('admin.promo.lookup.usedHint') }}</p>
          </template>

          <!-- * Not used: why validation may refuse it * -->
          <template v-else>
            <p class="text-sm">{{ t(`admin.promo.lookup.verdict.${promo.status(result.promo)}`) }}</p>
            <div>
              <p class="text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">
                {{ t('admin.promo.lookup.conditions') }}
              </p>
              <ul class="text-sm space-y-1 list-disc pl-5 text-gray-700 dark:text-gray-300">
                <li>{{ scopeText(result.promo) }}</li>
                <li v-if="result.promo.min_subtotal">
                  {{ t('admin.promo.lookup.condMin', { v: fmtEuro(result.promo.min_subtotal) }) }}
                </li>
                <li>
                  {{ t('admin.promo.lookup.condWindow', {
                    from: fmtDateTime(result.promo.valid_from),
                    until: fmtDateTime(result.promo.valid_until),
                  }) }}
                </li>
                <li>{{ t('admin.promo.lookup.condSingleUse') }}</li>
              </ul>
            </div>
          </template>

          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 border-t border-gray-100 dark:border-sidebar pt-2">
            <span>{{ scopeText(result.promo) }}</span>
            <span v-if="result.promo.batch_id">
              {{ t('admin.promo.lookup.batch', { id: result.promo.batch_id.slice(0, 8), date: fmtDateTime(result.promo.created_at) }) }}
            </span>
            <span v-else>{{ t('admin.promo.lookup.single', { date: fmtDateTime(result.promo.created_at) }) }}</span>
            <span v-if="result.promo.note">{{ result.promo.note }}</span>
          </div>
        </div>

        <!-- * Every order that carried the code * -->
        <div>
          <h3 class="text-sm font-medium mb-2">
            {{ t('admin.promo.lookup.ordersTitle', { n: result.orders.length }) }}
          </h3>
          <p v-if="result.orders.length === 0" class="text-sm text-gray-500">
            {{ t('admin.promo.lookup.noOrders') }}
          </p>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th class="px-3 py-2">{{ t('admin.promo.lookup.col.order') }}</th>
                  <th class="px-3 py-2">{{ t('admin.promo.lookup.col.date') }}</th>
                  <th class="px-3 py-2">{{ t('admin.promo.lookup.col.customer') }}</th>
                  <th class="px-3 py-2">{{ t('admin.promo.lookup.col.total') }}</th>
                  <th class="px-3 py-2">{{ t('admin.promo.lookup.col.status') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in result.orders" :key="o.id" class="border-t border-gray-100 dark:border-sidebar align-top">
                  <td class="px-3 py-2">
                    <button type="button" class="font-mono font-medium text-brand-primary hover:underline" @click="openOrder(o.id)">
                      {{ o.order_number }}
                    </button>
                    <div v-if="o.id === result.promo.used_by_order_id" class="text-[11px] font-medium text-brand-green">
                      {{ t('admin.promo.lookup.redeemedHere') }}
                    </div>
                  </td>
                  <td class="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{{ fmtDateTime(o.created_at) }}</td>
                  <td class="px-3 py-2">
                    <div>{{ o.name ?? '—' }}</div>
                    <div class="text-xs text-gray-500">{{ o.email ?? '—' }}</div>
                    <div v-if="o.phone" class="text-xs text-gray-400">{{ o.phone }}</div>
                  </td>
                  <td class="px-3 py-2 whitespace-nowrap">
                    {{ fmtEuro(o.total) }}
                    <div v-if="o.promo_discount" class="text-xs text-gray-500">−{{ fmtEuro(o.promo_discount) }}</div>
                    <div v-if="o.refund_total > 0" class="text-xs text-brand-secondary">
                      {{ t('admin.promo.lookup.refunded', { v: fmtEuro(o.refund_total) }) }}
                    </div>
                  </td>
                  <td class="px-3 py-2">
                    <span class="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap" :class="orderClass(o)">
                      {{ orderStatusLabel(o) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>

    <!-- * ───────────── Email mode ───────────── * -->
    <template v-if="result && result.mode === 'email'">
      <p v-if="result.codes.length === 0 && result.orders.length === 0" class="text-sm text-gray-500">
        {{ t('admin.promo.lookup.emailNothing', { email: result.query }) }}
      </p>
      <div v-else class="space-y-4">
        <div>
          <h3 class="text-sm font-medium mb-2">
            {{ t('admin.promo.lookup.emailCodesTitle', { n: result.codes.length, email: result.query }) }}
          </h3>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="c in result.codes"
              :key="c.id"
              type="button"
              class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-sidebar hover:border-brand-primary text-sm"
              @click="run(c.code)"
            >
              <span class="font-mono font-medium">{{ c.code }}</span>
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusClass(promo.status(c))">
                {{ t(`admin.promo.status.${promo.status(c)}`) }}
              </span>
            </button>
          </div>
        </div>

        <div v-if="result.orders.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th class="px-3 py-2">{{ t('admin.promo.lookup.col.order') }}</th>
                <th class="px-3 py-2">{{ t('admin.promo.lookup.col.date') }}</th>
                <th class="px-3 py-2">{{ t('admin.promo.lookup.col.code') }}</th>
                <th class="px-3 py-2">{{ t('admin.promo.lookup.col.total') }}</th>
                <th class="px-3 py-2">{{ t('admin.promo.lookup.col.status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in result.orders" :key="o.id" class="border-t border-gray-100 dark:border-sidebar align-top">
                <td class="px-3 py-2">
                  <button type="button" class="font-mono font-medium text-brand-primary hover:underline" @click="openOrder(o.id)">
                    {{ o.order_number }}
                  </button>
                  <div class="text-xs text-gray-500">{{ o.name ?? '—' }}</div>
                </td>
                <td class="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{{ fmtDateTime(o.created_at) }}</td>
                <td class="px-3 py-2 font-mono text-xs">
                  {{ result.codes.find((c) => c.id === o.promo_code_id)?.code ?? '—' }}
                </td>
                <td class="px-3 py-2 whitespace-nowrap">
                  {{ fmtEuro(o.total) }}
                  <div v-if="o.promo_discount" class="text-xs text-gray-500">−{{ fmtEuro(o.promo_discount) }}</div>
                </td>
                <td class="px-3 py-2">
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap" :class="orderClass(o)">
                    {{ orderStatusLabel(o) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <AdminOrdersOrderDetailDrawer v-model="detailOpen" :order-id="detailId" />
  </div>
</template>
