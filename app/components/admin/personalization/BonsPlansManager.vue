<script setup lang="ts">
// * Bons plans manager — the "Bons plans" tab of /admin/personalization.
// * Controls the home "Les bons plans du moment" carousel: show/hide toggle,
// * a custom title (empty → i18n default), and a hand-picked, reorderable
// * roster of products. Roster edits persist immediately through the
// * admin-featured-products edge function; the title/toggle save together.
import { useSiteSettingsStore } from '~/stores/siteSettings'
import { useProductsStore, type Product } from '~/stores/products'
import { useFeaturedProductsStore } from '~/stores/featuredProducts'

const { t, locale } = useI18n()
const { edgeErrorMessage } = useEdgeError()
const siteSettings = useSiteSettingsStore()
const products = useProductsStore()
const featured = useFeaturedProductsStore()
const client = useSupabaseClient()

const title = ref('')
const active = ref(false)
const saving = ref(false)
const saved = ref(false)
const errorMsg = ref<string | null>(null)

// * Roster controls
const pickId = ref('')
const adding = ref(false)
const busyId = ref<string | null>(null)
const rosterError = ref<string | null>(null)

onMounted(() => {
  if (!siteSettings.settings) siteSettings.fetchAll()
  if (!products.items.length) products.fetchAll()
  featured.fetchAll()
})

watch(
  () => siteSettings.settings,
  (s) => {
    title.value = s?.bons_plans_title ?? ''
    active.value = !!s?.bons_plans_active
  },
  { immediate: true },
)

function productName(p: Product) {
  return p.name[locale.value as 'fr' | 'en'] ?? p.name.fr
}
function imageUrl(p: Product | null): string | null {
  const path = p?.images?.[0]?.image_path
  if (!path) return null
  const { data } = client.storage.from('product-images').getPublicUrl(path)
  return data?.publicUrl ?? null
}

// * Resolve the ordered roster to live products (skip deleted picks).
const rosterRows = computed(() =>
  featured.items
    .map((f) => ({ featuredId: f.id, product: products.byId(f.product_id) }))
    .filter((r): r is { featuredId: string; product: Product } => !!r.product),
)

// * Products that can still be added (visible, not already featured).
const available = computed(() => {
  const taken = new Set(featured.items.map((f) => f.product_id))
  return products.items
    .filter((p) => p.is_visible && !taken.has(p.id))
    .sort((a, b) => productName(a).localeCompare(productName(b)))
})

async function saveSettings() {
  errorMsg.value = null
  saving.value = true
  saved.value = false
  try {
    await siteSettings.update({
      bons_plans_active: active.value,
      bons_plans_title: title.value.trim() || null,
    })
    saved.value = true
    setTimeout(() => (saved.value = false), 3000)
  } catch (err) {
    errorMsg.value = edgeErrorMessage(err)
  } finally {
    saving.value = false
  }
}

async function addPick() {
  if (!pickId.value) return
  rosterError.value = null
  adding.value = true
  try {
    await featured.add(pickId.value)
    pickId.value = ''
  } catch (err) {
    rosterError.value = edgeErrorMessage(err)
  } finally {
    adding.value = false
  }
}

async function removePick(id: string) {
  busyId.value = id
  try {
    await featured.remove(id)
  } finally {
    busyId.value = null
  }
}

// * Swap a row with its neighbour and persist the resulting order.
async function move(index: number, dir: -1 | 1) {
  const target = index + dir
  if (target < 0 || target >= featured.items.length) return
  const list = [...featured.items]
  const tmp = list[index]!
  list[index] = list[target]!
  list[target] = tmp
  const order = list.map((f, i) => ({ id: f.id, sort_order: i }))
  busyId.value = list[target]!.id
  try {
    await featured.reorder(order)
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div class="space-y-6 max-w-3xl">
    <div>
      <h2 class="font-heading text-xl font-bold">{{ t('admin.bonsPlans.title') }}</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ t('admin.bonsPlans.subtitle') }}</p>
    </div>

    <!-- * Visibility + title -->
    <form class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-6 space-y-5" @submit.prevent="saveSettings">
      <label class="flex items-center gap-3">
        <input v-model="active" type="checkbox" class="w-4 h-4 accent-brand-primary" />
        <span class="text-sm font-medium">{{ t('admin.bonsPlans.active') }}</span>
      </label>

      <label class="block">
        <span class="text-sm font-medium">{{ t('admin.bonsPlans.titleLabel') }}</span>
        <input
          v-model="title"
          type="text"
          :placeholder="t('storefront.home.bonsPlans.title')"
          class="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent focus:ring-2 focus:ring-brand-primary focus:outline-none"
        />
        <p class="text-xs text-gray-500 mt-1">{{ t('admin.bonsPlans.titleHint') }}</p>
      </label>

      <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

      <div class="flex items-center gap-3">
        <button
          type="submit"
          :disabled="saving"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-semibold hover:opacity-90 disabled:opacity-60"
        >
          <UIcon v-if="saving" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          {{ t('common.save') }}
        </button>
        <span v-if="saved" class="text-sm text-brand-green inline-flex items-center gap-1">
          <UIcon name="i-lucide-check-circle-2" class="w-4 h-4" />
          {{ t('admin.bonsPlans.saved') }}
        </span>
      </div>
    </form>

    <!-- * Roster -->
    <div class="bg-white dark:bg-sidebar-surface rounded-card shadow-card-sm p-6 space-y-4">
      <div>
        <h3 class="font-heading font-bold">{{ t('admin.bonsPlans.products') }}</h3>
        <p class="text-xs text-gray-500">{{ t('admin.bonsPlans.productsHint') }}</p>
      </div>

      <!-- * Add picker -->
      <div class="flex items-center gap-2">
        <select
          v-model="pickId"
          class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-sidebar bg-transparent text-sm focus:ring-2 focus:ring-brand-primary focus:outline-none"
        >
          <option value="">{{ t('admin.bonsPlans.pickPlaceholder') }}</option>
          <option v-for="p in available" :key="p.id" :value="p.id">
            {{ productName(p) }} — {{ p.reference }}
          </option>
        </select>
        <button
          type="button"
          :disabled="!pickId || adding"
          class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-primary text-white text-sm font-medium hover:bg-brand-primary-dark disabled:opacity-50"
          @click="addPick"
        >
          <UIcon v-if="adding" name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          <UIcon v-else name="i-lucide-plus" class="w-4 h-4" />
          {{ t('admin.bonsPlans.add') }}
        </button>
      </div>
      <p v-if="rosterError" class="text-sm text-brand-secondary">{{ rosterError }}</p>

      <!-- * Ordered list -->
      <div v-if="rosterRows.length === 0" class="py-8 text-center text-sm text-gray-500">
        <UIcon name="i-lucide-sparkles" class="w-8 h-8 mx-auto mb-2 opacity-40" />
        {{ t('admin.bonsPlans.empty') }}
      </div>
      <ul v-else class="divide-y divide-gray-100 dark:divide-sidebar">
        <li
          v-for="(row, i) in rosterRows"
          :key="row.featuredId"
          class="flex items-center gap-3 py-2.5"
          :class="busyId === row.featuredId ? 'opacity-50' : ''"
        >
          <div class="flex flex-col">
            <button
              type="button"
              :disabled="i === 0 || busyId !== null"
              class="p-0.5 text-gray-400 hover:text-brand-primary disabled:opacity-30"
              @click="move(i, -1)"
            >
              <UIcon name="i-lucide-chevron-up" class="w-4 h-4" />
            </button>
            <button
              type="button"
              :disabled="i === rosterRows.length - 1 || busyId !== null"
              class="p-0.5 text-gray-400 hover:text-brand-primary disabled:opacity-30"
              @click="move(i, 1)"
            >
              <UIcon name="i-lucide-chevron-down" class="w-4 h-4" />
            </button>
          </div>
          <div class="w-12 h-12 rounded-lg bg-gray-100 dark:bg-sidebar flex items-center justify-center overflow-hidden shrink-0">
            <img v-if="imageUrl(row.product)" :src="imageUrl(row.product)!" class="w-full h-full object-cover" alt="" />
            <UIcon v-else name="i-lucide-image" class="w-5 h-5 text-gray-400" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-medium text-sm truncate">{{ productName(row.product) }}</div>
            <div class="text-xs text-gray-500">
              {{ row.product.reference }}
              <span v-if="row.product.category"> · {{ row.product.category }}</span>
            </div>
          </div>
          <button
            type="button"
            :disabled="busyId !== null"
            class="p-2 rounded-lg hover:bg-brand-secondary/10 text-brand-secondary disabled:opacity-50"
            :title="t('admin.bonsPlans.remove')"
            @click="removePick(row.featuredId)"
          >
            <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
