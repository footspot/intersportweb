// * Fund (cagnotte) Pinia store. Admin only.
// * Keeps a map of histories keyed by club_id so opening a card doesn't refetch
// * data already loaded. After a credit/debit, only the affected history is refreshed.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'
import { useClubsStore } from '~/stores/clubs'

export type FundTxType =
  | 'auto_sale'
  | 'manual_credit'
  | 'manual_debit'
  | 'refund_reversal'

export interface FundTransaction {
  id: string
  club_id: string
  type: FundTxType
  amount: number                // * signed
  reason: string
  reference: string | null
  order_item_id: string | null
  created_by: string | null
  created_at: string
  // * Resolved from order_item → product for auto_sale rows (localized name object).
  product_name?: { fr: string; en?: string } | null
}

interface FundState {
  historyByClub: Record<string, FundTransaction[]>
  loadingClub: Record<string, boolean>
  error: string | null
}

export const useFundStore = defineStore('fund', {
  state: (): FundState => ({
    historyByClub: {},
    loadingClub: {},
    error: null,
  }),

  getters: {
    history: (state) => (clubId: string) => state.historyByClub[clubId] ?? [],
    lastN: (state) => (clubId: string, n: number) =>
      (state.historyByClub[clubId] ?? []).slice(0, n),
  },

  actions: {
    async fetchHistory(clubId: string, limit = 50) {
      this.loadingClub[clubId] = true
      this.error = null
      try {
        const client = useSupabaseClient()
        const { data, error } = await client
          .from('fund_transactions')
          .select('*, order_item:order_items(product:products(name))')
          .eq('club_id', clubId)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) throw error
        // * Flatten the embedded product name onto each tx so the UI stays simple.
        this.historyByClub[clubId] = (data ?? []).map((row: any) => {
          const { order_item, ...tx } = row
          return { ...tx, product_name: order_item?.product?.name ?? null }
        }) as FundTransaction[]
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'Failed to load history'
      } finally {
        this.loadingClub[clubId] = false
      }
    },

    async credit(clubId: string, amount: number, reason: string, reference?: string) {
      return this.post(clubId, 'manual_credit', amount, reason, reference)
    },

    async debit(clubId: string, amount: number, reason: string, reference?: string) {
      return this.post(clubId, 'manual_debit', amount, reason, reference)
    },

    async post(
      clubId: string,
      type: 'manual_credit' | 'manual_debit',
      amount: number,
      reason: string,
      reference?: string,
    ) {
      const { data, error } = await invokeEdge<{
        transaction: FundTransaction
        club_id: string
        new_balance: number
      }>('admin-fund', {
        method: 'POST',
        body: { club_id: clubId, type, amount, reason, reference },
      })
      if (error) throw new Error(error.message)

      if (data) {
        // * Push the new tx to the front of the history
        const list = this.historyByClub[clubId] ?? []
        this.historyByClub[clubId] = [data.transaction, ...list]

        // * Reflect the new balance in the clubs store so cards update instantly
        const clubs = useClubsStore()
        const club = clubs.items.find((c) => c.id === clubId)
        if (club) club.fund_balance = data.new_balance
      }
      return data
    },
  },
})
