// * Orders Pinia store — back-office reads + mutations, keyed to the realtime feed.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'partially_refunded'
  | 'shipped'
  | 'awaiting_pickup'
  | 'picked_up'
  | 'delivered'
  | 'cancelled'
  | 'refunded'

export type PaymentMethod = 'paypal' | 'card' | null
export type OrderLineStatus = 'ok' | 'refunded_oos'

// * Allowed forward transitions per current status — single source of truth
// * for both the orders Table dropdown and the OrderDetailDrawer action row.
// * `pending` intentionally has no `paid` transition: the SystemPay IPN is
// * the only path that flips an order to paid (otherwise stock decrement
// * and the payment-confirmed email would be bypassed).
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:               ['cancelled'],
  paid:                  ['shipped', 'awaiting_pickup', 'partially_refunded', 'cancelled', 'refunded'],
  shipped:               ['delivered', 'refunded', 'cancelled'],
  delivered:             ['refunded'],
  awaiting_pickup:       ['picked_up', 'cancelled', 'refunded'],
  picked_up:             ['refunded'],
  partially_refunded:    ['shipped', 'delivered', 'refunded'],
  cancelled:             [],
  refunded:              [],
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  // * Null for bundle lines (resolved via order_item_components instead).
  variant_id: string | null
  quantity: number
  size: string
  // * Secondary-axis size for bundle lines (e.g. sock size). Null otherwise.
  secondary_size: string | null
  // * Color variant name snapshot (display only; null = no color).
  color: string | null
  // * Custom paid options snapshot (display only; price baked into unit_price_paid).
  selected_options: { name: string; price: number }[]
  buying_price_snapshot: number
  selling_price_snapshot: number
  unit_price_paid: number
  discount_source_snapshot: 'club' | 'intersport' | null
  fund_credit_snapshot: number
  status: OrderLineStatus
  flocking_name: string | null
  flocking_initial: string | null
  flocking_number: string | null
  product?: {
    name: { fr: string; en: string }
    reference: string
    weight_grams?: number
    images?: { image_path: string; position: number }[]
  } | null
}

export interface Refund {
  id: string
  order_id: string
  amount: number
  reason: string
  processor_ref: string | null
  processed_at: string
  created_by: string | null
}

export interface Order {
  id: string
  order_number: string
  club_id: string | null
  status: OrderStatus
  payment_method: PaymentMethod
  payment_id: string | null
  shipping_tracking: string | null
  label_pdf_path: string | null
  label_generated_at: string | null
  subtotal: number
  shipping_cost: number
  refund_total: number
  total: number
  shipping_address: Record<string, any>
  created_at: string
  paid_at: string | null
  shipped_at: string | null
  delivered_at: string | null
  // * Guest-only orders — identity stored on-row, no profile join.
  guest_email: string | null
  guest_first_name: string | null
  guest_last_name: string | null
  access_token: string
  delivery_method: 'colissimo' | 'club_pickup' | 'shop_pickup'
  pickup_shop_id: string | null
  club?: { name: string } | null
  items?: OrderItem[]
  refunds?: Refund[]
}

interface OrderState {
  items: Order[]
  loading: boolean
  error: string | null
  detailed: Record<string, Order>         // * cache of orders loaded with items + refunds
}

export const useOrdersStore = defineStore('orders', {
  state: (): OrderState => ({
    items: [],
    loading: false,
    error: null,
    detailed: {},
  }),

  getters: {
    byStatus: (state) => (status: OrderStatus | 'all') => {
      if (status === 'all') return state.items
      return state.items.filter((o) => o.status === status)
    },
    counts(state) {
      const acc: Record<string, number> = { all: state.items.length }
      for (const o of state.items) acc[o.status] = (acc[o.status] ?? 0) + 1
      return acc
    },
  },

  actions: {
    async fetchAll() {
      this.loading = true
      this.error = null
      try {
        const client = useSupabaseClient()
        const { data, error } = await client
          .from('orders')
          .select('*, club:clubs(name)')
          .order('created_at', { ascending: false })
          .limit(500)
        if (error) throw error
        this.items = (data ?? []) as Order[]
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load orders'
      } finally {
        this.loading = false
      }
    },

    async fetchDetail(id: string, force = false): Promise<Order | null> {
      if (!force && this.detailed[id]) return this.detailed[id]
      const client = useSupabaseClient()
      const { data, error } = await client
        .from('orders')
        .select(
          '*, club:clubs(name),' +
            'items:order_items(*, product:products(name,reference,weight_grams,images:product_images(image_path,position))),' +
            'refunds(*)',
        )
        .eq('id', id)
        .single()
      if (error) throw error
      this.detailed[id] = data as Order
      return this.detailed[id]
    },

    /** * Called by the realtime subscription when an order row changes. */
    upsert(o: Order) {
      const idx = this.items.findIndex((x) => x.id === o.id)
      if (idx === -1) this.items.unshift(o)
      else this.items[idx] = { ...this.items[idx], ...o }
      if (this.detailed[o.id]) this.detailed[o.id] = { ...this.detailed[o.id], ...o }
    },

    async setStatus(id: string, status: OrderStatus) {
      const { data, error } = await invokeEdge<{ order: Order }>('backoffice-orders/status', {
        method: 'POST',
        body: { id, status },
      })
      if (error) throw new Error(error.message)
      if (data?.order) this.upsert(data.order)
      return data?.order
    },

    async setTracking(id: string, tracking: string | null, markShipped = false) {
      const { data, error } = await invokeEdge<{ order: Order }>('backoffice-orders/tracking', {
        method: 'POST',
        body: { id, tracking, mark_shipped: markShipped },
      })
      if (error) throw new Error(error.message)
      if (data?.order) this.upsert(data.order)
      return data?.order
    },

    async refundLines(
      orderId: string,
      itemIds: string[],
      options: { restock?: boolean; reason?: string } = {},
    ) {
      const { data, error } = await invokeEdge<{
        ok: true
        refund?: Refund
        refunded: number
        lines?: unknown
      }>('refund-order', {
        method: 'POST',
        body: {
          order_id: orderId,
          item_ids: itemIds,
          restock: !!options.restock,
          reason: options.reason,
        },
      })
      if (error) {
        const e = new Error(error.message) as Error & { code?: string; detail?: unknown }
        e.code = error.code
        e.detail = error.detail
        throw e
      }
      // * Refresh the detail cache to pick up new statuses/refunds
      await this.fetchDetail(orderId, true)
      return data
    },
  },
})
