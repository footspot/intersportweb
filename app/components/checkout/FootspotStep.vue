<script setup lang="ts">
// * Checkout "Adhésion club" step — only renders when the cart's club has an
// *   active Footspot link. A single path: the prepaid code (member tracking +
// *   money credit), which also carries the member identity.
import { invokeEdge } from '~/composables/useEdgeFunction'

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
  prepaidApplied: PrepaidApplied | null
}
defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:prepaidApplied', v: PrepaidApplied | null): void
  (e: 'identityLocked', v: { first_name: string; last_name: string; email: string } | null): void
}>()

const { t } = useI18n()

const prepaidRaw = ref('')
const prepaidOpen = ref(false)
const prepaidChecking = ref(false)
const prepaidError = ref<string | null>(null)

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
          class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm font-mono uppercase focus:ring-2 focus:ring-brand-gold focus:outline-none"
        />
        <button
          type="button"
          :disabled="prepaidChecking || !prepaidRaw.trim()"
          class="shrink-0 whitespace-nowrap px-4 py-2 rounded-lg bg-brand-gold text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
          @click="applyPrepaid"
        >
          {{ prepaidChecking ? t('common.loading') : t('checkout.footspot.prepaid.apply') }}
        </button>
      </div>
      <p v-if="prepaidError" class="text-xs text-brand-secondary mt-1">{{ prepaidError }}</p>
    </div>
  </div>
</template>
