<script setup lang="ts">
// * /admin/notifications — full paginated history with filters.
import { useNotifications, type NotificationRow } from '~/composables/useNotifications'

definePageMeta({ layout: 'admin', middleware: ['backoffice'], ssr: false })

const { t, locale } = useI18n()
const notif = useNotifications()

const filterUnread = ref(false)
const filterKind = ref<string>('all')

// * Distinct kinds present in the loaded set — derives the chip list.
const availableKinds = computed(() =>
  Array.from(new Set(notif.items.value.map((n) => n.kind))).sort(),
)

const filtered = computed(() => {
  let rows = notif.items.value as NotificationRow[]
  if (filterUnread.value) rows = rows.filter((r) => !r.read_at)
  if (filterKind.value !== 'all') rows = rows.filter((r) => r.kind === filterKind.value)
  return rows
})

await useAsyncData('admin-notifications-page', async () => {
  await notif.fetch(200)
  return true
})

onMounted(() => {
  notif.subscribe()
})

onBeforeUnmount(() => {
  notif.unsubscribe()
})

function iconFor(kind: string): string {
  switch (kind) {
    case 'low_stock': return 'i-lucide-package-x'
    case 'bundle_component_oos_at_sale': return 'i-lucide-alert-octagon'
    case 'product_locked_into_bundle': return 'i-lucide-package-plus'
    case 'product_released_from_bundle': return 'i-lucide-package-minus'
    case 'footspot_cagnotte_credited': return 'i-lucide-piggy-bank'
    case 'footspot_cagnotte_debited': return 'i-lucide-banknote-arrow-down'
    default: return 'i-lucide-bell'
  }
}
function colorFor(kind: string): string {
  switch (kind) {
    case 'low_stock': return 'text-brand-gold'
    case 'bundle_component_oos_at_sale': return 'text-brand-secondary'
    case 'product_locked_into_bundle': return 'text-brand-primary'
    case 'product_released_from_bundle': return 'text-brand-green'
    case 'footspot_cagnotte_credited': return 'text-brand-green'
    case 'footspot_cagnotte_debited': return 'text-brand-gold'
    default: return 'text-gray-500'
  }
}
function bodyFor(n: NotificationRow): string {
  return t(`admin.notifications.kind.${n.kind}.body`, n.payload as Record<string, unknown>)
}
function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso))
}
async function rowClick(n: NotificationRow) {
  if (!n.read_at) await notif.markRead(n.id)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="font-heading text-2xl font-bold">{{ t('admin.notifications.title') }}</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.notifications.subtitle') }}</p>
      </div>
      <button
        v-if="notif.unreadCount.value > 0"
        type="button"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark"
        @click="notif.markAllRead"
      >
        <UIcon name="i-lucide-check-check" class="w-4 h-4" />
        <span>{{ t('admin.notifications.markAllRead') }}</span>
      </button>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium border"
        :class="!filterUnread ? 'bg-brand-primary text-white border-brand-primary' : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
        @click="filterUnread = false"
      >
        {{ t('admin.notifications.filter.all') }}
      </button>
      <button
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium border"
        :class="filterUnread ? 'bg-brand-primary text-white border-brand-primary' : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
        @click="filterUnread = true"
      >
        {{ t('admin.notifications.filter.unread') }} ({{ notif.unreadCount.value }})
      </button>

      <div class="h-5 w-px bg-gray-200 dark:bg-sidebar mx-2" />

      <button
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium border"
        :class="filterKind === 'all' ? 'bg-brand-primary text-white border-brand-primary' : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
        @click="filterKind = 'all'"
      >
        {{ t('admin.notifications.filter.allKinds') }}
      </button>
      <button
        v-for="k in availableKinds"
        :key="k"
        type="button"
        class="px-3 py-1.5 rounded-full text-xs font-medium border inline-flex items-center gap-1.5"
        :class="filterKind === k ? 'bg-brand-primary text-white border-brand-primary' : 'border-gray-200 dark:border-sidebar hover:bg-gray-50 dark:hover:bg-sidebar'"
        @click="filterKind = k"
      >
        <UIcon :name="iconFor(k)" class="w-3.5 h-3.5" :class="filterKind === k ? '' : colorFor(k)" />
        {{ t(`admin.notifications.kind.${k}.title`) }}
      </button>
    </div>

    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm overflow-hidden">
      <div v-if="notif.loading.value && filtered.length === 0" class="p-10 text-center text-gray-500">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="filtered.length === 0" class="p-10 text-center">
        <UIcon name="i-lucide-bell-off" class="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p class="text-gray-500">{{ t('admin.notifications.empty') }}</p>
      </div>
      <ul v-else class="divide-y divide-gray-100 dark:divide-sidebar">
        <li
          v-for="n in filtered"
          :key="n.id"
          class="px-5 py-4 hover:bg-gray-50 dark:hover:bg-sidebar cursor-pointer transition-colors"
          :class="!n.read_at ? 'bg-brand-primary/5' : ''"
          @click="rowClick(n)"
        >
          <div class="flex items-start gap-3">
            <UIcon :name="iconFor(n.kind)" class="w-5 h-5 mt-0.5 shrink-0" :class="colorFor(n.kind)" />
            <div class="flex-1 min-w-0">
              <div class="flex items-baseline justify-between gap-3">
                <span class="font-medium text-sm">{{ t(`admin.notifications.kind.${n.kind}.title`) }}</span>
                <span class="text-xs text-gray-400 shrink-0">{{ fmtDate(n.created_at) }}</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">{{ bodyFor(n) }}</p>
            </div>
            <span
              v-if="!n.read_at"
              class="w-2 h-2 rounded-full bg-brand-primary mt-2 shrink-0"
            />
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>
