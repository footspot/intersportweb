<script setup lang="ts">
// * Admin notifications bell. Lives in AdminTopbar.
// *   Dropdown lists the 20 most recent rows. Clicking a row marks it read;
// *   notifications are informational only — there's nowhere to navigate by
// *   default. The full /admin/notifications page handles pagination + filters.
import { useNotifications, type NotificationRow } from '~/composables/useNotifications'
import { useAuthStore } from '~/stores/auth'

const { t, locale } = useI18n()
const notif = useNotifications()
const auth = useAuthStore()

const open = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

// * Wait for the auth store to expose the uid before fetching — the profile
// * is usually loaded by the backoffice middleware before mount, but watch
// * immediately so a slow load still triggers the fetch once it lands.
let started = false
watch(
  () => auth.profile?.id,
  async (uid) => {
    if (!uid || started) return
    started = true
    await notif.fetch()
    notif.subscribe()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  notif.unsubscribe()
})

function toggle() {
  open.value = !open.value
}

function close() {
  open.value = false
}

onClickOutside(dropdownRef, close)

const recent = computed(() => notif.items.value.slice(0, 20))

function iconFor(kind: string): string {
  switch (kind) {
    case 'low_stock': return 'i-lucide-package-x'
    case 'bundle_component_oos_at_sale': return 'i-lucide-alert-octagon'
    case 'product_locked_into_bundle': return 'i-lucide-lock'
    case 'product_released_from_bundle': return 'i-lucide-unlock'
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
  const p = n.payload as Record<string, string | number | undefined>
  // * Each kind interpolates the payload into its translated body.
  return t(`admin.notifications.kind.${n.kind}.body`, p as Record<string, unknown>)
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return t('admin.notifications.justNow')
  if (diff < 3600) return t('admin.notifications.minutesAgo', { n: Math.floor(diff / 60) })
  if (diff < 86400) return t('admin.notifications.hoursAgo', { n: Math.floor(diff / 3600) })
  return new Intl.DateTimeFormat(locale.value, { dateStyle: 'short' }).format(new Date(iso))
}

async function rowClick(n: NotificationRow) {
  if (!n.read_at) await notif.markRead(n.id)
}

async function onMarkAllRead() {
  await notif.markAllRead()
}
</script>

<template>
  <ClientOnly>
    <div class="relative" ref="dropdownRef">
      <button
        type="button"
        class="w-9 h-9 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-sidebar relative"
        :aria-label="t('admin.notifications.title')"
        @click="toggle"
      >
        <UIcon name="i-lucide-bell" class="w-5 h-5" />
        <span
          v-if="notif.unreadCount.value > 0"
          class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-secondary text-white text-[10px] font-bold flex items-center justify-center"
        >
          {{ notif.unreadCount.value > 99 ? '99+' : notif.unreadCount.value }}
        </span>
      </button>

      <div
        v-if="open"
        class="absolute right-0 mt-2 w-[360px] max-h-[480px] bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg border border-gray-100 dark:border-sidebar z-50 flex flex-col"
      >
        <div class="px-4 py-3 border-b border-gray-100 dark:border-sidebar flex items-center justify-between">
          <span class="font-heading font-bold text-sm">{{ t('admin.notifications.title') }}</span>
          <button
            v-if="notif.unreadCount.value > 0"
            type="button"
            class="text-xs text-brand-primary hover:underline"
            @click="onMarkAllRead"
          >
            {{ t('admin.notifications.markAllRead') }}
          </button>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div v-if="notif.loading.value && recent.length === 0" class="p-6 text-center text-xs text-gray-500">
            {{ t('common.loading') }}
          </div>
          <div v-else-if="recent.length === 0" class="p-6 text-center">
            <UIcon name="i-lucide-bell-off" class="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p class="text-xs text-gray-500">{{ t('admin.notifications.empty') }}</p>
          </div>
          <ul v-else class="divide-y divide-gray-100 dark:divide-sidebar">
            <li
              v-for="n in recent"
              :key="n.id"
              class="px-4 py-3 hover:bg-gray-50 dark:hover:bg-sidebar cursor-pointer transition-colors"
              :class="!n.read_at ? 'bg-brand-primary/5' : ''"
              @click="rowClick(n)"
            >
              <div class="flex items-start gap-3">
                <UIcon :name="iconFor(n.kind)" class="w-4 h-4 mt-0.5 shrink-0" :class="colorFor(n.kind)" />
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium">
                    {{ t(`admin.notifications.kind.${n.kind}.title`) }}
                  </div>
                  <div class="text-xs text-gray-500 mt-0.5 line-clamp-2">{{ bodyFor(n) }}</div>
                  <div class="text-[10px] text-gray-400 mt-1">{{ timeAgo(n.created_at) }}</div>
                </div>
                <span
                  v-if="!n.read_at"
                  class="w-2 h-2 rounded-full bg-brand-primary mt-1.5 shrink-0"
                />
              </div>
            </li>
          </ul>
        </div>

        <NuxtLink
          to="/admin/notifications"
          class="px-4 py-2.5 text-xs text-center text-brand-primary hover:bg-gray-50 dark:hover:bg-sidebar border-t border-gray-100 dark:border-sidebar"
          @click="close"
        >
          {{ t('admin.notifications.viewAll') }}
        </NuxtLink>
      </div>
    </div>
  </ClientOnly>
</template>
