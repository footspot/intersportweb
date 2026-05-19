// * Subscribes the orders Pinia store to postgres_changes on the orders table.
// * Plays the beep and pushes a toast when an order transitions to paid.
// * Call from any back-office page that wants the live feed — dedupes under the hood.
import { useOrdersStore, type Order } from '~/stores/orders'
import { useOrderSound } from '~/composables/useOrderSound'

let channel: ReturnType<ReturnType<typeof useSupabaseClient>['channel']> | null = null
let refCount = 0

export function useRealtimeOrders(options: { onPaid?: (o: Order) => void } = {}) {
  const client = useSupabaseClient()
  const orders = useOrdersStore()
  const sound = useOrderSound()
  const { onPaid } = options

  function attach() {
    if (channel) return
    channel = client
      .channel('orders-stream')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const next = payload.new as Order
          orders.upsert(next)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          const prev = payload.old as Partial<Order>
          const next = payload.new as Order
          orders.upsert(next)

          // * Trigger alert only on the pending → paid transition
          if (prev?.status !== 'paid' && next.status === 'paid') {
            sound.play()
            onPaid?.(next)
          }
        },
      )
      .subscribe()
  }

  function detach() {
    if (!channel) return
    if (refCount > 0) return
    client.removeChannel(channel)
    channel = null
  }

  onMounted(() => {
    refCount++
    attach()
  })

  onBeforeUnmount(() => {
    refCount = Math.max(0, refCount - 1)
    if (refCount === 0) detach()
  })
}
