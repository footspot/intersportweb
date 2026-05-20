<script setup lang="ts">
// * Checkout "Adhésion club" step — only renders when the cart's club has an
// *   active Footspot link. Two paths:
// *     1. Purchase code (member tracking only — no money applied)
// *     2. Prepaid code (member tracking + money credit)
// *   Both are mutually exclusive: applying a prepaid code hides the purchase
// *   code input (the prepaid code already carries member identity).
import { invokeEdge } from '~/composables/useEdgeFunction'

export interface PurchaseCodeApplied {
  code: string
  member_id: string
  member_name?: string
}

export interface PrepaidApplied {
  code: string
  prepaid_code_ref: string
  member_id: string
  member_name?: string
  member_email?: string
  club_id: string
  club_name?: string
  cap_amount_cents: number
}

interface Props {
  clubId: string
  subtotalAfterPromo: number
  enabled: boolean
  purchaseApplied: PurchaseCodeApplied | null
  prepaidApplied: PrepaidApplied | null
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:purchaseApplied', v: PurchaseCodeApplied | null): void
  (e: 'update:prepaidApplied', v: PrepaidApplied | null): void
  (e: 'identityLocked', v: { first_name: string; last_name: string; email: string } | null): void
}>()

const { t } = useI18n()

const isMember = ref<'yes' | 'no'>('no')
const purchaseRaw = ref('')
const purchaseChecking = ref(false)
const purchaseError = ref<string | null>(null)

const prepaidRaw = ref('')
const prepaidOpen = ref(false)
const prepaidChecking = ref(false)
const prepaidError = ref<string | null>(null)

const purchaseDisplay = computed({
  get: () => {
    const v = purchaseRaw.value
    return v.length > 4 ? `${v.slice(0, 4)} ${v.slice(4, 8)}` : v
  },
  set: (v: string) => {
    purchaseRaw.value = v.replace(/\s+/g, '').toUpperCase().replace(/[^A-HJ-KM-NP-Z2-9]/g, '').slice(0, 8)
  },
})

watch(purchaseRaw, async (v) => {
  purchaseError.value = null
  if (v.length !== 8) {
    if (props.purchaseApplied) emit('update:purchaseApplied', null)
    return
  }
  purchaseChecking.value = true
  try {
    const { data, error } = await invokeEdge<{
      valid: boolean
      reason?: string
      member_id?: string
      member_name?: string
    }>('footspot-validate-purchase-code', {
      method: 'POST',
      body: { club_id: props.clubId, code: v },
    })
    if (error) throw new Error(error.message)
    if (!data?.valid) {
      const reason = data?.reason ?? 'unknown'
      purchaseError.value = t(`checkout.footspot.purchase.errors.${reason}`)
      emit('update:purchaseApplied', null)
      return
    }
    emit('update:purchaseApplied', {
      code: v,
      member_id: data.member_id!,
      member_name: data.member_name,
    })
  } catch (e) {
    purchaseError.value = e instanceof Error ? e.message : t('auth.errors.generic')
  } finally {
    purchaseChecking.value = false
  }
})

async function applyPrepaid() {
  prepaidError.value = null
  const code = prepaidRaw.value.trim().toUpperCase().replace(/\s+/g, '')
  if (!code) {
    prepaidError.value = t('checkout.footspot.prepaid.errors.empty')
    return
  }
  prepaidChecking.value = true
  try {
    const { data, error } = await invokeEdge<{
      valid: boolean
      reason?: string
      prepaid_code_ref?: string
      member_id?: string
      member_name?: string
      member_email?: string
      club_id?: string
      club_name?: string
      cap_amount_cents?: number
    }>('validate-prepaid-code', {
      method: 'POST',
      body: { code },
    })
    if (error) throw new Error(error.message)
    if (!data?.valid) {
      prepaidError.value = t(`checkout.footspot.prepaid.errors.${data?.reason ?? 'unknown'}`)
      emit('update:prepaidApplied', null)
      emit('identityLocked', null)
      return
    }
    const applied: PrepaidApplied = {
      code,
      prepaid_code_ref: data.prepaid_code_ref!,
      member_id: data.member_id!,
      member_name: data.member_name,
      member_email: data.member_email,
      club_id: data.club_id!,
      club_name: data.club_name,
      cap_amount_cents: data.cap_amount_cents ?? 0,
    }
    emit('update:prepaidApplied', applied)
    // * Auto-lock identity from the Footspot member record.
    const parts = (applied.member_name ?? '').split(/\s+/)
    emit('identityLocked', {
      first_name: parts[0] ?? '',
      last_name: parts.slice(1).join(' '),
      email: applied.member_email ?? '',
    })
    // * Prepaid carries member identity; the purchase code section becomes
    // *   redundant. Reset any previously-applied purchase code.
    emit('update:purchaseApplied', null)
    isMember.value = 'no'
  } catch (e) {
    prepaidError.value = e instanceof Error ? e.message : t('auth.errors.generic')
  } finally {
    prepaidChecking.value = false
  }
}

function removePrepaid() {
  prepaidRaw.value = ''
  prepaidError.value = null
  emit('update:prepaidApplied', null)
  emit('identityLocked', null)
}

function fmtEuro(cents: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}
</script>

<template>
  <div v-if="enabled" class="space-y-4">
    <!-- Prepaid code path -->
    <div>
      <button
        v-if="!prepaidApplied && !prepaidOpen"
        type="button"
        class="text-sm text-brand-primary hover:underline inline-flex items-center gap-1"
        @click="prepaidOpen = true"
      >
        <UIcon name="i-lucide-ticket" class="w-4 h-4" />
        {{ t('checkout.footspot.prepaid.openLink') }}
      </button>

      <div v-if="prepaidApplied" class="flex items-start justify-between p-3 rounded-lg bg-brand-gold/10 border border-brand-gold/40 text-sm">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-ticket-check" class="w-4 h-4 text-brand-gold" />
            <span class="font-medium">{{ t('checkout.footspot.prepaid.bannerTitle', { club: prepaidApplied.club_name ?? '—' }) }}</span>
          </div>
          <div class="text-xs text-gray-600 mt-1">
            {{ t('checkout.footspot.prepaid.bannerCredit', { cap: fmtEuro(prepaidApplied.cap_amount_cents) }) }}
          </div>
          <div v-if="prepaidApplied.member_name" class="text-xs text-gray-500 mt-0.5">
            {{ t('checkout.footspot.prepaid.bannerMember', { name: prepaidApplied.member_name }) }}
          </div>
        </div>
        <button type="button" class="text-xs text-brand-secondary hover:underline" @click="removePrepaid">
          {{ t('checkout.footspot.prepaid.remove') }}
        </button>
      </div>

      <div v-else-if="prepaidOpen" class="flex items-stretch gap-2">
        <input
          v-model="prepaidRaw"
          type="text"
          :placeholder="t('checkout.footspot.prepaid.placeholder')"
          class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm font-mono uppercase focus:ring-2 focus:ring-brand-gold focus:outline-none"
        />
        <button
          type="button"
          :disabled="prepaidChecking || !prepaidRaw.trim()"
          class="px-4 py-2 rounded-lg bg-brand-gold text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
          @click="applyPrepaid"
        >
          {{ prepaidChecking ? t('common.loading') : t('checkout.footspot.prepaid.apply') }}
        </button>
      </div>
      <p v-if="prepaidError" class="text-xs text-brand-secondary mt-1">{{ prepaidError }}</p>
    </div>

    <!-- Member purchase code path — hidden when a prepaid code is already applied -->
    <div v-if="!prepaidApplied" class="space-y-2 border-t border-gray-100 dark:border-sidebar pt-4">
      <div class="text-sm font-medium">{{ t('checkout.footspot.purchase.question') }}</div>
      <div class="grid grid-cols-2 gap-2">
        <label
          class="flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm"
          :class="isMember === 'no' ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-200 dark:border-sidebar'"
        >
          <input type="radio" v-model="isMember" value="no" class="accent-brand-primary" />
          {{ t('checkout.footspot.purchase.no') }}
        </label>
        <label
          class="flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm"
          :class="isMember === 'yes' ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-200 dark:border-sidebar'"
        >
          <input type="radio" v-model="isMember" value="yes" class="accent-brand-primary" />
          {{ t('checkout.footspot.purchase.yes') }}
        </label>
      </div>

      <div v-if="isMember === 'yes'" class="space-y-1">
        <input
          v-model="purchaseDisplay"
          type="text"
          maxlength="9"
          :placeholder="t('checkout.footspot.purchase.placeholder')"
          class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm font-mono uppercase tracking-widest focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
        <p v-if="purchaseChecking" class="text-xs text-gray-500">{{ t('common.loading') }}</p>
        <p v-else-if="purchaseError" class="text-xs text-brand-secondary">{{ purchaseError }}</p>
        <p v-else-if="purchaseApplied" class="text-xs text-brand-green">
          <UIcon name="i-lucide-check-circle-2" class="w-3.5 h-3.5 inline" />
          {{ t('checkout.footspot.purchase.applied', { name: purchaseApplied.member_name ?? '' }) }}
        </p>
      </div>
    </div>
  </div>
</template>
