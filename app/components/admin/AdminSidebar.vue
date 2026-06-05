<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useSportsStore } from '~/stores/sports'
import { useClubsStore } from '~/stores/clubs'
import { useProductsStore } from '~/stores/products'
import { useOrdersStore } from '~/stores/orders'
import { useUsersStore } from '~/stores/users'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()

const mounted = ref(false)
onMounted(() => { mounted.value = true })
const sports = useSportsStore()
const clubs = useClubsStore()
const products = useProductsStore()
const orders = useOrdersStore()
const users = useUsersStore()

interface NavItem {
  to: string
  label: string
  icon: string
  adminOnly?: boolean
  // * Open the target in a new browser tab (used for "view site").
  external?: boolean
  // * Reactive count pulled from an already-populated store.
  // * Returns null when the store is empty so the badge stays hidden
  // * (we never fetch eagerly just to show a number).
  count?: () => number | null
}

type Accent = 'primary' | 'secondary'

interface NavSection {
  title: string
  accent?: Accent
  items: NavItem[]
}

const accentClasses: Record<Accent, { bar: string; iconTile: string; badge: string }> = {
  primary: {
    bar: 'bg-brand-primary',
    iconTile: 'bg-brand-primary/15 text-brand-primary-light',
    badge: 'bg-brand-primary text-white',
  },
  secondary: {
    bar: 'bg-brand-secondary',
    iconTile: 'bg-brand-secondary/15 text-brand-secondary',
    badge: 'bg-brand-secondary text-white',
  },
}

function storeCount(n: number) {
  return n > 0 ? n : null
}

const sections = computed<NavSection[]>(() => [
  {
    title: t('admin.sidebar.main'),
    items: [
      { to: '/admin', label: t('admin.sidebar.dashboard'), icon: 'i-lucide-layout-dashboard' },
      { to: '/admin/sports', label: t('admin.sidebar.sports'), icon: 'i-lucide-trophy', adminOnly: true, count: () => storeCount(sports.items.length) },
      { to: '/admin/clubs', label: t('admin.sidebar.clubs'), icon: 'i-lucide-shield', adminOnly: true, count: () => storeCount(clubs.items.length) },
      { to: '/admin/products', label: t('admin.sidebar.products'), icon: 'i-lucide-package', count: () => storeCount(products.items.length) },
    ],
  },
  {
    title: t('admin.sidebar.commerce'),
    accent: 'secondary',
    items: [
      { to: '/admin/orders', label: t('admin.sidebar.orders'), icon: 'i-lucide-shopping-cart', count: () => storeCount(orders.items.length) },
      { to: '/admin/labels', label: t('admin.labels.title'), icon: 'i-lucide-printer' },
      { to: '/admin/pickups', label: t('admin.pickups.title'), icon: 'i-lucide-package-check' },
      { to: '/admin/intersport-shops', label: t('admin.shops.title'), icon: 'i-lucide-store', adminOnly: true },
      { to: '/admin/fund', label: t('admin.sidebar.fund'), icon: 'i-lucide-piggy-bank', adminOnly: true },
      { to: '/admin/catalog', label: t('admin.sidebar.catalog'), icon: 'i-lucide-book-open', adminOnly: true },
      { to: '/admin/promo-codes', label: t('admin.sidebar.promoCodes'), icon: 'i-lucide-ticket-percent', adminOnly: true },
      { to: '/admin/prepaid-orders', label: t('admin.prepaidOrders.title'), icon: 'i-lucide-receipt', adminOnly: true },
      { to: '/admin/stats', label: t('admin.sidebar.stats'), icon: 'i-lucide-bar-chart-3', adminOnly: true },
    ],
  },
  {
    title: t('admin.sidebar.administration'),
    items: [
      { to: '/admin/users', label: t('admin.sidebar.users'), icon: 'i-lucide-users', adminOnly: true, count: () => storeCount(users.items.length) },
      { to: '/admin/personalization', label: t('admin.sidebar.personalization'), icon: 'i-lucide-palette', adminOnly: true },
      { to: '/admin/footspot', label: t('admin.footspot.title'), icon: 'i-lucide-link-2', adminOnly: true },
      { to: '/admin/notifications', label: t('admin.notifications.title'), icon: 'i-lucide-bell' },
      { to: '/admin/settings', label: t('admin.sidebar.settings'), icon: 'i-lucide-settings', adminOnly: true },
      { to: '/', label: t('admin.sidebar.viewSite'), icon: 'i-lucide-external-link', external: true },
    ],
  },
])

// * Returns true until mounted so SSR/hydration never emits a style mismatch.
function visible(item: NavItem) {
  if (!mounted.value) return true
  return !item.adminOnly || auth.isAdmin
}

// * An item is active when it is the exact route or a nested child,
// * except "/admin" which must not match every /admin/* page.
// * Returns false until mounted so SSR and hydration always agree (no mismatch).
function isActive(to: string) {
  if (!mounted.value) return false
  if (to === '/admin') return route.path === '/admin'
  if (to === '/') return false
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <aside class="w-64 shrink-0 bg-sidebar text-gray-200 min-h-screen flex flex-col">
    <div class="px-6 py-5 border-b border-sidebar-surface">
      <img
        src="/logo_horizontal_mono_noir.svg"
        alt="Intersport Club IDF"
        class="h-14 w-auto invert "
      >
    </div>

    <nav class="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
      <div v-for="section in sections" :key="section.title">
        <h3 class="px-3 text-xs uppercase tracking-wider text-gray-500 mb-2">
          {{ section.title }}
        </h3>
        <ul class="space-y-1.5">
          <li v-for="item in section.items" :key="item.to" v-show="visible(item)">
            <NuxtLink
              :to="item.to"
              :external="item.external"
              :target="item.external ? '_blank' : undefined"
              :rel="item.external ? 'noopener noreferrer' : undefined"
              :class="[
                'group relative flex items-center gap-3 px-2.5 py-2 rounded-xl text-sm transition-all duration-150',
                isActive(item.to)
                  ? 'bg-sidebar-bg text-white font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                  : 'text-gray-400 hover:bg-sidebar-surface hover:text-white',
              ]"
            >
              <span
                v-if="isActive(item.to)"
                :class="[
                  'absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full',
                  accentClasses[section.accent ?? 'primary'].bar,
                ]"
                aria-hidden="true"
              />

              <span
                :class="[
                  'flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors',
                  isActive(item.to)
                    ? accentClasses[section.accent ?? 'primary'].iconTile
                    : 'bg-white/5 text-gray-400 group-hover:bg-white/10 group-hover:text-white',
                ]"
              >
                <UIcon :name="item.icon" class="w-4 h-4" />
              </span>

              <span class="flex-1 truncate">{{ item.label }}</span>

              <span
                v-if="mounted && item.count && item.count()"
                :class="[
                  'ml-auto min-w-[1.5rem] px-2 py-0.5 text-xs font-semibold rounded-full text-center leading-tight',
                  isActive(item.to)
                    ? accentClasses[section.accent ?? 'primary'].badge
                    : 'bg-white/10 text-gray-300 group-hover:bg-white/15',
                ]"
              >
                {{ item.count() }}
              </span>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </nav>
  </aside>
</template>
