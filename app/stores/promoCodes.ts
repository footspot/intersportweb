// * Promo codes store — admin CRUD.
// *
// *   Codes are single-use globally. The atomic claim happens at payment
// *   success (IPN); admin actions here only configure the code.
import { defineStore } from 'pinia'
import { invokeEdge } from '~/composables/useEdgeFunction'

export type PromoAbsorbsBy = 'intersport' | 'club'

export interface PromoCode {
  id: string
  code: string
  amount: number
  min_subtotal: number | null
  absorbs_by: PromoAbsorbsBy
  valid_from: string | null
  valid_until: string | null
  used_at: string | null
  used_by_order_id: string | null
  used_by_email: string | null
  note: string | null
  created_at: string
}

export interface PromoCodeInput {
  id?: string
  code?: string
  amount?: number
  min_subtotal?: number | null
  absorbs_by?: PromoAbsorbsBy
  valid_from?: string | null
  valid_until?: string | null
  note?: string | null
}

export const usePromoCodesStore = defineStore('promoCodes', () => {
  const items = ref<PromoCode[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  function status(p: PromoCode): 'used' | 'expired' | 'scheduled' | 'active' {
    if (p.used_at) return 'used'
    const now = Date.now()
    if (p.valid_until && new Date(p.valid_until).getTime() < now) return 'expired'
    if (p.valid_from && new Date(p.valid_from).getTime() > now) return 'scheduled'
    return 'active'
  }

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await invokeEdge<{ items: PromoCode[] }>('admin-promo-codes', {
        method: 'GET',
      })
      if (err) throw new Error(err.message)
      items.value = data?.items ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load promo codes'
    } finally {
      loading.value = false
    }
  }

  async function create(payload: PromoCodeInput) {
    const { data, error: err } = await invokeEdge<{ promo: PromoCode }>('admin-promo-codes', {
      method: 'POST',
      body: payload,
    })
    if (err) {
      const tag = err.code === 'code_already_exists' ? 'code_already_exists' : err.message
      throw new Error(tag)
    }
    if (data?.promo) items.value.unshift(data.promo)
    return data?.promo
  }

  async function update(payload: PromoCodeInput & { id: string }) {
    const { data, error: err } = await invokeEdge<{ promo: PromoCode }>('admin-promo-codes', {
      method: 'PUT',
      body: payload,
    })
    if (err) throw new Error(err.message)
    const updated = data?.promo
    if (updated) {
      const idx = items.value.findIndex((x) => x.id === updated.id)
      if (idx !== -1) items.value[idx] = updated
    }
    return updated
  }

  async function remove(id: string) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-promo-codes', {
      method: 'DELETE',
      query: { id },
    })
    if (err) throw new Error(err.message)
    items.value = items.value.filter((x) => x.id !== id)
  }

  return { items, loading, error, status, fetchAll, create, update, remove }
})
