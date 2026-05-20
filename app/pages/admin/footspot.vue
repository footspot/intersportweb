<script setup lang="ts">
// * /admin/footspot — Flow 2 entry. Admin sends an integration request to the
// *   Footspot PDG when a club director phoned in (no in-app Footspot account
// *   yet). Also shows the request history with status badges.
import { useClubsStore } from '~/stores/clubs'
import { invokeEdge } from '~/composables/useEdgeFunction'

definePageMeta({ layout: 'admin', middleware: ['admin'], ssr: false })

const { t, locale } = useI18n()
const clubs = useClubsStore()
const client = useSupabaseClient()

interface IntegrationRequest {
  id: string
  club_id: string
  club_name: string
  contact_name: string
  contact_email: string
  contact_phone: string
  status: 'sent' | 'completed' | 'failed'
  sent_at: string
  completed_at: string | null
}

interface LinkedClub {
  id: string
  club_id: string
  footspot_club_id: string
  status: string
  linked_at: string
}
interface EventLogRow {
  id: string
  club_id: string
  order_id: string | null
  event_type: string
  status: 'pending' | 'sent' | 'failed' | 'acknowledged'
  attempts: number
  last_error: string | null
  created_at: string
}

const requests = ref<IntegrationRequest[]>([])
const linkedClubs = ref<LinkedClub[]>([])
const eventLog = ref<EventLogRow[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

async function loadRequests() {
  const { data } = await client
    .from('footspot_integration_requests')
    .select('*')
    .order('sent_at', { ascending: false })
  requests.value = (data ?? []) as IntegrationRequest[]
}
async function loadLinks() {
  const { data } = await client
    .from('footspot_links')
    .select('id, club_id, footspot_club_id, status, linked_at')
    .eq('status', 'active')
    .order('linked_at', { ascending: false })
  linkedClubs.value = (data ?? []) as LinkedClub[]
}
async function loadEventLog() {
  const { data } = await client
    .from('footspot_event_log')
    .select('id, club_id, order_id, event_type, status, attempts, last_error, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  eventLog.value = (data ?? []) as EventLogRow[]
}

async function reloadAll() {
  loading.value = true
  error.value = null
  try {
    await Promise.all([loadRequests(), loadLinks(), loadEventLog()])
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    loading.value = false
  }
}

function clubName(clubId: string): string {
  return clubs.items.find((c) => c.id === clubId)?.name ?? clubId
}

const unlinkOpen = ref(false)
const unlinkTarget = ref<LinkedClub | null>(null)
const unlinkBusy = ref(false)
function askUnlink(l: LinkedClub) {
  unlinkTarget.value = l
  unlinkOpen.value = true
}
async function doUnlink() {
  if (!unlinkTarget.value) return
  unlinkBusy.value = true
  try {
    await invokeEdge('footspot-admin', {
      method: 'POST',
      body: { action: 'unlink', club_id: unlinkTarget.value.club_id },
    })
    unlinkOpen.value = false
    unlinkTarget.value = null
    await Promise.all([loadLinks(), clubs.fetchAll()])
  } finally {
    unlinkBusy.value = false
  }
}

const resendingId = ref<string | null>(null)
async function resendEvent(row: EventLogRow) {
  resendingId.value = row.id
  try {
    await invokeEdge('footspot-admin', {
      method: 'POST',
      body: { action: 'resend_event', event_log_id: row.id },
    })
    await loadEventLog()
  } finally {
    resendingId.value = null
  }
}

await useAsyncData('admin-footspot-page', async () => {
  await clubs.fetchAll()
  await reloadAll()
  return true
})

// * Clubs without an active link AND without a recent (<7d) sent request are
// *   the eligible targets for a new request.
const eligibleClubs = computed(() => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentSent = new Set(
    requests.value
      .filter((r) => r.status === 'sent' && new Date(r.sent_at).getTime() > cutoff)
      .map((r) => r.club_id),
  )
  return clubs.items.filter((c) => !c.footspot_linked && !recentSent.has(c.id))
})

const selectedClubId = ref<string>('')
const contactName = ref('')
const contactEmail = ref('')
const contactPhone = ref('')
const submitBusy = ref(false)
const submitError = ref<string | null>(null)
const submitOk = ref(false)

const selectedClub = computed(() => clubs.items.find((c) => c.id === selectedClubId.value) ?? null)

async function submit() {
  submitError.value = null
  submitOk.value = false
  if (!selectedClubId.value || !contactName.value.trim() || !contactEmail.value.trim() || !contactPhone.value.trim()) {
    submitError.value = t('admin.footspot.errors.missingFields')
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.value.trim())) {
    submitError.value = t('admin.footspot.errors.invalidEmail')
    return
  }
  submitBusy.value = true
  try {
    const club = selectedClub.value
    const { error: err } = await invokeEdge('footspot-send-new-club-request', {
      method: 'POST',
      body: {
        club_id: selectedClubId.value,
        club_name: club?.name ?? '',
        contact_name: contactName.value.trim(),
        contact_email: contactEmail.value.trim(),
        contact_phone: contactPhone.value.trim(),
      },
    })
    if (err) {
      if (err.code === 'club_already_linked') submitError.value = t('admin.footspot.errors.alreadyLinked')
      else if (err.code === 'recent_request_pending') submitError.value = t('admin.footspot.errors.recentPending')
      else submitError.value = err.message
      return
    }
    submitOk.value = true
    selectedClubId.value = ''
    contactName.value = ''
    contactEmail.value = ''
    contactPhone.value = ''
    await loadRequests()
  } finally {
    submitBusy.value = false
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}

function statusClass(s: IntegrationRequest['status']) {
  switch (s) {
    case 'sent':      return 'bg-brand-gold/15 text-brand-gold'
    case 'completed': return 'bg-brand-green/15 text-brand-green'
    case 'failed':    return 'bg-brand-secondary/15 text-brand-secondary'
  }
}

function eventStatusClass(s: EventLogRow['status']) {
  switch (s) {
    case 'sent':         return 'bg-brand-green/15 text-brand-green'
    case 'acknowledged': return 'bg-brand-green/15 text-brand-green'
    case 'pending':      return 'bg-brand-gold/15 text-brand-gold'
    case 'failed':       return 'bg-brand-secondary/15 text-brand-secondary'
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="font-heading text-2xl font-bold">{{ t('admin.footspot.title') }}</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.footspot.subtitle') }}</p>
    </div>

    <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-5 space-y-4">
      <h2 class="font-heading font-bold">{{ t('admin.footspot.form.title') }}</h2>
      <p class="text-xs text-gray-500">{{ t('admin.footspot.form.hint') }}</p>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.footspot.field.club') }}</span>
        <select
          v-model="selectedClubId"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        >
          <option value="">{{ t('admin.footspot.field.clubPick') }}</option>
          <option v-for="c in eligibleClubs" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <p v-if="eligibleClubs.length === 0" class="text-xs text-gray-500 mt-1">
          {{ t('admin.footspot.field.clubEmpty') }}
        </p>
      </label>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.footspot.field.contactName') }}</span>
          <input
            v-model="contactName"
            type="text"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>
        <label class="block">
          <span class="text-sm font-medium">{{ t('admin.footspot.field.contactPhone') }}</span>
          <input
            v-model="contactPhone"
            type="tel"
            class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
          />
        </label>
      </div>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.footspot.field.contactEmail') }}</span>
        <input
          v-model="contactEmail"
          type="email"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
      </label>

      <p v-if="submitError" class="text-sm text-brand-secondary">{{ submitError }}</p>
      <p v-if="submitOk" class="text-sm text-brand-green">
        <UIcon name="i-lucide-check-circle-2" class="w-4 h-4 inline" />
        {{ t('admin.footspot.form.sent') }}
      </p>

      <div class="flex justify-end">
        <button
          type="button"
          class="px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-60"
          :disabled="submitBusy || !selectedClubId"
          @click="submit"
        >
          {{ submitBusy ? t('common.loading') : t('admin.footspot.form.submit') }}
        </button>
      </div>
    </section>

    <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div class="px-5 py-3 border-b border-gray-100 dark:border-sidebar">
        <h2 class="font-heading font-bold">{{ t('admin.footspot.history.title') }}</h2>
      </div>
      <div v-if="loading" class="p-10 text-center text-gray-500">{{ t('common.loading') }}</div>
      <div v-else-if="requests.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-mail" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.footspot.history.empty') }}</p>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3">{{ t('admin.footspot.col.club') }}</th>
            <th class="px-4 py-3">{{ t('admin.footspot.col.contact') }}</th>
            <th class="px-4 py-3">{{ t('admin.footspot.col.sentAt') }}</th>
            <th class="px-4 py-3">{{ t('admin.footspot.col.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in requests" :key="r.id" class="border-t border-gray-100 dark:border-sidebar">
            <td class="px-4 py-3 font-medium">{{ r.club_name }}</td>
            <td class="px-4 py-3 text-xs">
              <div>{{ r.contact_name }}</div>
              <div class="text-gray-500">{{ r.contact_email }} · {{ r.contact_phone }}</div>
            </td>
            <td class="px-4 py-3 text-xs text-gray-500">{{ fmtDate(r.sent_at) }}</td>
            <td class="px-4 py-3">
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="statusClass(r.status)">
                {{ t(`admin.footspot.status.${r.status}`) }}
              </span>
              <div v-if="r.completed_at" class="text-xs text-gray-400 mt-1">{{ fmtDate(r.completed_at) }}</div>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div class="px-5 py-3 border-b border-gray-100 dark:border-sidebar">
        <h2 class="font-heading font-bold">{{ t('admin.footspot.linked.title') }}</h2>
      </div>
      <div v-if="linkedClubs.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-link-2-off" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.footspot.linked.empty') }}</p>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3">{{ t('admin.footspot.col.club') }}</th>
            <th class="px-4 py-3">{{ t('admin.footspot.linked.footspotId') }}</th>
            <th class="px-4 py-3">{{ t('admin.footspot.linked.linkedAt') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.footspot.col.status') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in linkedClubs" :key="l.id" class="border-t border-gray-100 dark:border-sidebar">
            <td class="px-4 py-3 font-medium">{{ clubName(l.club_id) }}</td>
            <td class="px-4 py-3 font-mono text-xs">{{ l.footspot_club_id }}</td>
            <td class="px-4 py-3 text-xs text-gray-500">{{ fmtDate(l.linked_at) }}</td>
            <td class="px-4 py-3 text-right">
              <button
                type="button"
                class="text-xs px-3 py-1.5 rounded-lg text-brand-secondary hover:bg-brand-secondary/10 font-medium"
                @click="askUnlink(l)"
              >
                {{ t('admin.footspot.linked.unlink') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div class="px-5 py-3 border-b border-gray-100 dark:border-sidebar">
        <h2 class="font-heading font-bold">{{ t('admin.footspot.events.title') }}</h2>
      </div>
      <div v-if="eventLog.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-radio" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.footspot.events.empty') }}</p>
      </div>
      <table v-else class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-sidebar text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th class="px-4 py-3">{{ t('admin.footspot.col.club') }}</th>
            <th class="px-4 py-3">{{ t('admin.footspot.events.type') }}</th>
            <th class="px-4 py-3">{{ t('admin.footspot.events.attempts') }}</th>
            <th class="px-4 py-3">{{ t('admin.footspot.col.sentAt') }}</th>
            <th class="px-4 py-3">{{ t('admin.footspot.col.status') }}</th>
            <th class="px-4 py-3 text-right">{{ t('admin.footspot.col.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ev in eventLog" :key="ev.id" class="border-t border-gray-100 dark:border-sidebar">
            <td class="px-4 py-3">{{ clubName(ev.club_id) }}</td>
            <td class="px-4 py-3 font-mono text-xs">{{ ev.event_type }}</td>
            <td class="px-4 py-3 text-xs">{{ ev.attempts }}</td>
            <td class="px-4 py-3 text-xs text-gray-500">{{ fmtDate(ev.created_at) }}</td>
            <td class="px-4 py-3">
              <span class="text-xs px-2 py-0.5 rounded-full font-medium" :class="eventStatusClass(ev.status)">
                {{ t(`admin.footspot.events.status.${ev.status}`) }}
              </span>
              <div v-if="ev.last_error" class="text-xs text-gray-400 mt-1 max-w-xs truncate" :title="ev.last_error">
                {{ ev.last_error }}
              </div>
            </td>
            <td class="px-4 py-3 text-right">
              <button
                v-if="ev.status === 'failed'"
                type="button"
                class="text-xs px-3 py-1.5 rounded-lg text-brand-primary hover:bg-brand-primary/10 font-medium disabled:opacity-50"
                :disabled="resendingId === ev.id"
                @click="resendEvent(ev)"
              >
                {{ resendingId === ev.id ? t('common.loading') : t('admin.footspot.events.resend') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <AdminConfirmDialog
      v-model="unlinkOpen"
      :title="t('admin.footspot.linked.unlinkTitle')"
      :message="t('admin.footspot.linked.unlinkConfirm', { club: unlinkTarget ? clubName(unlinkTarget.club_id) : '' })"
      :busy="unlinkBusy"
      @confirm="doUnlink"
    />
  </div>
</template>
