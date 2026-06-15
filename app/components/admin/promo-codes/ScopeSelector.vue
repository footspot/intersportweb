<script setup lang="ts">
// * Promo scope picker shared by the single-code + batch modals.
// *   - global   → applies to any cart (no club).
// *   - club     → pick sport → club; code only discounts that club's products.
// *   - products → pick sport → club, then a pack of that club's products.
// * A product pack is single-club by construction (the picker is scoped to one
// *   club), which is what the edge function enforces server-side.
import { useSportsStore } from '~/stores/sports'
import { useClubsStore, type Club } from '~/stores/clubs'
import { useProductsStore } from '~/stores/products'
import type { PromoScope } from '~/stores/promoCodes'

const scope = defineModel<PromoScope>('scope', { required: true })
const clubId = defineModel<string>('clubId', { required: true })
const productIds = defineModel<string[]>('productIds', { required: true })

const { t, locale } = useI18n()
const sports = useSportsStore()
const clubs = useClubsStore()
const products = useProductsStore()

const sportId = ref('')
const productSearch = ref('')
const loadingProducts = ref(false)

onMounted(async () => {
  if (sports.items.length === 0) await sports.fetchAll()
  if (clubs.items.length === 0) await clubs.fetchAll()
  // * Preselect the sport from an existing club (edit mode).
  syncSportFromClub()
  if (scope.value === 'products') await ensureProducts()
})

function syncSportFromClub() {
  if (!clubId.value) return
  const c = clubs.items.find((x) => x.id === clubId.value)
  if (c) sportId.value = c.sport_id
}

async function ensureProducts() {
  if (products.items.length === 0 && !loadingProducts.value) {
    loadingProducts.value = true
    try {
      await products.fetchAll()
    } finally {
      loadingProducts.value = false
    }
  }
}

function pickScope(s: PromoScope) {
  scope.value = s
  if (s === 'global') {
    clubId.value = ''
    productIds.value = []
  }
  if (s === 'products') ensureProducts()
}

// * User-driven select changes reset downstream picks (programmatic preset in
// *   edit mode goes through onMounted/syncSportFromClub and is left intact).
function onSportChange() {
  clubId.value = ''
  productIds.value = []
}
function onClubChange() {
  productIds.value = []
}

const clubsForSport = computed<Club[]>(() =>
  sportId.value ? clubs.items.filter((c) => c.sport_id === sportId.value) : [],
)

const productsForClub = computed(() => {
  if (!clubId.value) return []
  const q = productSearch.value.trim().toLowerCase()
  return products.byClub(clubId.value).filter((p) => {
    if (!q) return true
    const name = (p.name[locale.value === 'fr' ? 'fr' : 'en'] || p.name.fr || '').toLowerCase()
    return name.includes(q) || p.reference.toLowerCase().includes(q)
  })
})

function toggleProduct(id: string) {
  const set = new Set(productIds.value)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  productIds.value = Array.from(set)
}

const scopeOptions: { value: PromoScope; icon: string }[] = [
  { value: 'global', icon: 'i-lucide-globe' },
  { value: 'club', icon: 'i-lucide-shield' },
  { value: 'products', icon: 'i-lucide-package' },
]
</script>

<template>
  <div class="space-y-3">
    <div>
      <span class="text-sm font-medium">{{ t('admin.promo.scope.label') }}</span>
      <div class="grid grid-cols-3 gap-2 mt-1">
        <label
          v-for="opt in scopeOptions"
          :key="opt.value"
          class="flex items-center gap-2 p-3 rounded-lg border cursor-pointer text-sm"
          :class="scope === opt.value ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-200 dark:border-sidebar'"
        >
          <input
            type="radio"
            :value="opt.value"
            :checked="scope === opt.value"
            class="accent-brand-primary"
            @change="pickScope(opt.value)"
          />
          <UIcon :name="opt.icon" class="w-4 h-4 shrink-0" />
          <span>{{ t(`admin.promo.scope.${opt.value}`) }}</span>
        </label>
      </div>
      <p class="text-xs text-gray-500 mt-1">{{ t(`admin.promo.scope.${scope}Hint`) }}</p>
    </div>

    <!-- * Sport + club pickers (club & products scopes) * -->
    <div v-if="scope !== 'global'" class="grid grid-cols-2 gap-2">
      <select
        v-model="sportId"
        class="px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        @change="onSportChange"
      >
        <option value="">— {{ t('admin.promo.scope.pickSport') }} —</option>
        <option v-for="s in sports.items" :key="s.id" :value="s.id">
          {{ s.name[locale === 'fr' ? 'fr' : 'en'] || s.name.fr }}
        </option>
      </select>
      <select
        v-model="clubId"
        :disabled="!sportId"
        class="px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none disabled:opacity-60"
        @change="onClubChange"
      >
        <option value="">— {{ t('admin.promo.scope.pickClub') }} —</option>
        <option v-for="c in clubsForSport" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>

    <!-- * Product pack multiselect (products scope) * -->
    <div v-if="scope === 'products' && clubId">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">{{ t('admin.promo.scope.products') }}</span>
        <span class="text-xs text-gray-500">{{ t('admin.promo.scope.selectedCount', { n: productIds.length }) }}</span>
      </div>
      <input
        v-model="productSearch"
        type="text"
        :placeholder="t('admin.promo.scope.searchProducts')"
        class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
      />
      <div class="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-sidebar divide-y divide-gray-100 dark:divide-sidebar">
        <div v-if="loadingProducts" class="p-4 text-center text-sm text-gray-500">{{ t('common.loading') }}</div>
        <div v-else-if="productsForClub.length === 0" class="p-4 text-center text-sm text-gray-500">
          {{ t('admin.promo.scope.noProducts') }}
        </div>
        <label
          v-for="p in productsForClub"
          v-else
          :key="p.id"
          class="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-sidebar"
        >
          <input
            type="checkbox"
            :checked="productIds.includes(p.id)"
            class="accent-brand-primary"
            @change="toggleProduct(p.id)"
          />
          <span class="flex-1 min-w-0 truncate">{{ p.name[locale === 'fr' ? 'fr' : 'en'] || p.name.fr }}</span>
          <span class="font-mono text-xs text-gray-400 shrink-0">{{ p.reference }}</span>
        </label>
      </div>
    </div>
  </div>
</template>
