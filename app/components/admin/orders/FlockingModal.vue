<script setup lang="ts">
// * Flocking-order modal — aggregates the pieces to flock from the given paid
// * orders (packs expanded into their component garments), lets the admin
// * untick references, previews quantities per size, then downloads a one-
// * page-per-club PDF (sorted by club) and flips the orders to 'in_flocking'.
import { useOrdersStore, type Order } from '~/stores/orders'
import { useProductsStore } from '~/stores/products'
import { useClubsStore } from '~/stores/clubs'
import { buildFlockingOrderPdf, type FlockingPdfClubBlock } from '~/composables/useFlockingOrderPdf'

interface Props {
  modelValue: boolean
  orders: Order[]
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
}>()

const { t } = useI18n()
const client = useSupabaseClient()
const ordersStore = useOrdersStore()
const productsStore = useProductsStore()
const clubsStore = useClubsStore()

// * One aggregated row per product reference actually present in the orders.
interface AggRow {
  id: string
  name: string
  reference: string
  clubId: string | null
  clubName: string
  sizes: Record<string, number>
  total: number
  orderIds: Set<string>
}

interface FetchedItem {
  order_id: string
  product_id: string
  quantity: number
  size: string | null
  status: string
  components:
    | {
        component_product_id: string
        quantity_per_unit: number
        variant: { size: string } | null
      }[]
    | null
}

const rows = ref<AggRow[]>([])
const selected = ref<Record<string, boolean>>({})
const loading = ref(false)
const running = ref(false)
const errorMsg = ref<string | null>(null)

// * Letter sizes in garment order, then numeric sizes, then the rest.
const LETTER_ORDER = ['2XS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL']
function sizeCompare(a: string, b: string) {
  const ia = LETTER_ORDER.indexOf(a.toUpperCase())
  const ib = LETTER_ORDER.indexOf(b.toUpperCase())
  if (ia !== -1 || ib !== -1) {
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  }
  const na = Number.parseFloat(a)
  const nb = Number.parseFloat(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return a.localeCompare(b, 'fr')
}

function clubNameOf(clubId: string | null, fallback: string | undefined) {
  return clubsStore.items.find((c) => c.id === clubId)?.name ?? fallback ?? '—'
}

// * Load the order lines (with pack components) and aggregate per product.
async function load() {
  loading.value = true
  errorMsg.value = null
  rows.value = []
  try {
    const ids = props.orders.map((o) => o.id)
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 80) chunks.push(ids.slice(i, i + 80))
    const results = await Promise.all(
      chunks.map((c) =>
        client
          .from('order_items')
          .select(
            'order_id, product_id, quantity, size, status,' +
              ' components:order_item_components(component_product_id, quantity_per_unit, variant:product_variants(size))',
          )
          .in('order_id', c),
      ),
    )
    const items: FetchedItem[] = results.flatMap((r) => {
      if (r.error) throw new Error(r.error.message)
      return (r.data ?? []) as FetchedItem[]
    })

    const byProduct = new Map<string, AggRow>()
    const add = (productId: string, orderId: string, size: string, count: number) => {
      const p = productsStore.byId(productId)
      let row = byProduct.get(productId)
      if (!row) {
        const order = props.orders.find((o) => o.id === orderId)
        row = {
          id: productId,
          name: p?.name.fr ?? p?.reference ?? '—',
          reference: p?.reference ?? '—',
          clubId: p?.club_id ?? null,
          clubName: clubNameOf(p?.club_id ?? null, order?.club?.name),
          sizes: {},
          total: 0,
          orderIds: new Set(),
        }
        byProduct.set(productId, row)
      }
      row.sizes[size] = (row.sizes[size] ?? 0) + count
      row.total += count
      row.orderIds.add(orderId)
    }

    for (const it of items) {
      if (it.status !== 'ok') continue
      const product = productsStore.byId(it.product_id)
      if (product?.is_pack && it.components?.length) {
        // * Packs expand into their real garments, each with its own size.
        for (const c of it.components) {
          add(c.component_product_id, it.order_id, c.variant?.size ?? '—', it.quantity * c.quantity_per_unit)
        }
      } else {
        add(it.product_id, it.order_id, it.size || '—', it.quantity)
      }
    }

    rows.value = [...byProduct.values()].sort(
      (a, b) => a.clubName.localeCompare(b.clubName, 'fr') || a.name.localeCompare(b.name, 'fr'),
    )
    selected.value = Object.fromEntries(rows.value.map((r) => [r.id, true]))
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) load()
  },
)

const checkedRows = computed(() => rows.value.filter((r) => selected.value[r.id]))
const multiClub = computed(() => new Set(rows.value.map((r) => r.clubId)).size > 1)
const sizeCols = computed(() =>
  [...new Set(checkedRows.value.flatMap((r) => Object.keys(r.sizes)))].sort(sizeCompare),
)
const totalPieces = computed(() => checkedRows.value.reduce((sum, r) => sum + r.total, 0))

function fmtDay(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function clientLabel(o: Order) {
  const first = o.guest_first_name?.trim()
  const last = o.guest_last_name?.trim()
  if (first && last) return `${first[0]!.toUpperCase()}. ${last}`
  return last || first || o.guest_email || '—'
}

function close() {
  if (!running.value) emit('update:modelValue', false)
}

async function confirm() {
  if (!checkedRows.value.length || running.value) return
  running.value = true
  errorMsg.value = null
  try {
    // * One PDF block per club that still has checked references; excluded
    // * references are listed on their club's page as "sans flocage".
    const byClub = new Map<string, { name: string; rows: AggRow[]; excluded: AggRow[] }>()
    for (const r of rows.value) {
      const key = r.clubId ?? '—'
      let block = byClub.get(key)
      if (!block) {
        block = { name: r.clubName, rows: [], excluded: [] }
        byClub.set(key, block)
      }
      ;(selected.value[r.id] ? block.rows : block.excluded).push(r)
    }

    const now = new Date()
    const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const frozenAt = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} à ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const markIds = new Set<string>()
    const blocks: FlockingPdfClubBlock[] = [...byClub.values()]
      .filter((b) => b.rows.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .map((b, idx) => {
        const orderIds = new Set(b.rows.flatMap((r) => [...r.orderIds]))
        const blockOrders = props.orders
          .filter((o) => orderIds.has(o.id))
          .sort((a, b2) => new Date(a.created_at).getTime() - new Date(b2.created_at).getTime())
        for (const o of blockOrders) markIds.add(o.id)
        return {
          clubName: b.name,
          lotRef: `LOT-${mmdd}-${String.fromCharCode(65 + (idx % 26))}`,
          sizeCols: [...new Set(b.rows.flatMap((r) => Object.keys(r.sizes)))].sort(sizeCompare),
          products: b.rows.map((r) => ({ name: r.name, reference: r.reference, sizes: r.sizes, total: r.total })),
          excluded: b.excluded.map((r) => ({ name: r.name, reference: r.reference, total: r.total })),
          orders: blockOrders.map((o) => ({ number: o.order_number, client: clientLabel(o), date: fmtDay(o.created_at) })),
          pieces: b.rows.reduce((sum, r) => sum + r.total, 0),
          ordersCount: blockOrders.length,
        }
      })

    const stamps = [...markIds]
      .map((id) => new Date(props.orders.find((o) => o.id === id)!.created_at).getTime())
      .sort((a, b) => a - b)
    const fmtFull = (ms: number) => {
      const d = new Date(ms)
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
    }
    const periodLabel = stamps.length
      ? `Commandes du ${fmtDay(new Date(stamps[0]!).toISOString())} au ${fmtFull(stamps[stamps.length - 1]!)}`
      : ''

    const blob = buildFlockingOrderPdf({ clubs: blocks, frozenAt, periodLabel })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ordre-flocage-${now.toISOString().slice(0, 10)}.pdf`
    a.click()
    URL.revokeObjectURL(url)

    // * Orders contributing at least one flocked piece move to 'in_flocking' —
    // * best-effort side write; the download already happened either way.
    if (markIds.size) await ordersStore.setFlocking([...markIds], 'in_flocking').catch(() => {})

    emit('update:modelValue', false)
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : String(err)
  } finally {
    running.value = false
  }
}
</script>

<template>
  <div
    v-if="modelValue"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    @click.self="close"
  >
    <div class="w-full max-w-2xl bg-white dark:bg-sidebar-surface rounded-card shadow-card-lg p-6 space-y-4 max-h-[90vh] flex flex-col">
      <div>
        <h3 class="font-heading text-lg font-bold">{{ t('admin.orders.flocking.title') }}</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{ t('admin.orders.flocking.subtitle', { n: orders.length }) }}
        </p>
      </div>

      <div v-if="loading" class="text-sm text-gray-500 p-3">{{ t('common.loading') }}</div>

      <div v-else-if="rows.length === 0" class="text-sm text-gray-500 p-3 bg-gray-50 dark:bg-sidebar rounded-lg">
        {{ t('admin.orders.flocking.empty') }}
      </div>

      <template v-else>
        <div class="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          <!-- * References to flock — tick/untick per product -->
          <div>
            <p class="text-xs uppercase tracking-wider text-gray-500 mb-2">
              {{ t('admin.orders.flocking.refsTitle') }}
            </p>
            <label
              v-for="r in rows"
              :key="r.id"
              class="flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer mb-1"
              :class="selected[r.id] ? 'bg-brand-primary/5 border-brand-primary/40' : 'border-gray-200 dark:border-sidebar'"
            >
              <input
                type="checkbox"
                :checked="!!selected[r.id]"
                class="w-4 h-4 accent-brand-primary shrink-0"
                :disabled="running"
                @change="(e) => (selected[r.id] = (e.target as HTMLInputElement).checked)"
              />
              <div class="flex-1 min-w-0">
                <span class="font-medium text-sm">{{ r.name }}</span>
                <div class="text-xs text-gray-500 truncate">
                  {{ r.reference }}<template v-if="multiClub"> · {{ r.clubName }}</template>
                </div>
              </div>
              <span class="font-heading font-bold text-lg shrink-0" :class="selected[r.id] ? '' : 'text-gray-300'">
                {{ r.total }}
              </span>
            </label>
          </div>

          <!-- * Quantities per size — checked references only -->
          <div v-if="checkedRows.length">
            <p class="text-xs uppercase tracking-wider text-gray-500 mb-2">
              {{ t('admin.orders.flocking.sizesTitle') }}
            </p>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="text-left text-xs uppercase tracking-wider text-gray-500 border-b-2 border-gray-900 dark:border-gray-200">
                  <tr>
                    <th class="py-2 pr-2">{{ t('admin.orders.flocking.product') }}</th>
                    <th v-for="s in sizeCols" :key="s" class="py-2 px-1 text-center">{{ s }}</th>
                    <th class="py-2 pl-2 text-right">{{ t('admin.orders.flocking.total') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in checkedRows" :key="r.id" class="border-b border-gray-100 dark:border-sidebar">
                    <td class="py-2 pr-2 font-medium">{{ r.name }}</td>
                    <td v-for="s in sizeCols" :key="s" class="py-2 px-1 text-center font-heading font-bold">
                      {{ r.sizes[s] ?? '—' }}
                    </td>
                    <td class="py-2 pl-2 text-right text-gray-500">{{ r.total }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <p v-if="errorMsg" class="text-sm text-brand-secondary">{{ errorMsg }}</p>

        <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-sidebar">
          <span class="mr-auto text-xs text-gray-500">
            {{ t('admin.orders.flocking.pieces', { n: totalPieces }) }}
          </span>
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-sidebar"
            :disabled="running"
            @click="close"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-medium bg-brand-primary text-white hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
            :disabled="running || checkedRows.length === 0"
            @click="confirm"
          >
            <UIcon name="i-lucide-download" class="w-4 h-4" />
            {{ running ? t('common.loading') : t('admin.orders.flocking.confirm') }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
