// * Promo codes store — admin CRUD.
// *
// *   Codes are single-use globally. The atomic claim happens at payment
// *   success (IPN); admin actions here only configure the code.
// *
// *   `batches` carries the aggregated batch list (codes auto-generated
// *   together). Individual codes inside a batch are loaded on demand via
// *   `fetchBatchCodes()` — typically only when the admin re-downloads the
// *   PDF, so we don't keep them in memory.
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
  club_id: string | null
  batch_id: string | null
  created_at: string
}

export interface PromoBatch {
  batch_id: string
  count: number
  used_count: number
  amount: number
  min_subtotal: number | null
  absorbs_by: PromoAbsorbsBy
  valid_from: string | null
  valid_until: string | null
  note: string | null
  club_id: string | null
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
  club_id?: string | null
}

export interface PromoBatchInput {
  count: number
  prefix: string
  amount: number
  min_subtotal: number | null
  absorbs_by: PromoAbsorbsBy
  valid_from: string | null
  valid_until: string | null
  note: string | null
  club_id: string | null
}

export interface PromoBatchCreated {
  batch_id: string
  count: number
  items: PromoCode[]
}

export const usePromoCodesStore = defineStore('promoCodes', () => {
  // * `items` only holds single (non-batch) codes — batches are surfaced via
  // * `batches`. Keeps the main list short on screens with thousands of
  // * batch-generated codes.
  const items = ref<PromoCode[]>([])
  const batches = ref<PromoBatch[]>([])
  const loading = ref(false)
  const loadingBatches = ref(false)
  const error = ref<string | null>(null)

  function status(p: PromoCode): 'used' | 'expired' | 'scheduled' | 'active' {
    if (p.used_at) return 'used'
    const now = Date.now()
    if (p.valid_until && new Date(p.valid_until).getTime() < now) return 'expired'
    if (p.valid_from && new Date(p.valid_from).getTime() > now) return 'scheduled'
    return 'active'
  }

  function batchStatus(b: PromoBatch): 'used_up' | 'partially_used' | 'expired' | 'scheduled' | 'active' {
    if (b.used_count >= b.count) return 'used_up'
    const now = Date.now()
    if (b.valid_until && new Date(b.valid_until).getTime() < now) return 'expired'
    if (b.valid_from && new Date(b.valid_from).getTime() > now) return 'scheduled'
    if (b.used_count > 0) return 'partially_used'
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

  async function fetchBatches() {
    loadingBatches.value = true
    try {
      const { data, error: err } = await invokeEdge<{ items: PromoBatch[] }>(
        'admin-promo-codes/batches',
        { method: 'GET' },
      )
      if (err) throw new Error(err.message)
      batches.value = data?.items ?? []
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load batches'
    } finally {
      loadingBatches.value = false
    }
  }

  async function fetchBatchCodes(batchId: string): Promise<PromoCode[]> {
    const { data, error: err } = await invokeEdge<{ items: PromoCode[] }>(
      'admin-promo-codes/batch',
      { method: 'GET', query: { id: batchId } },
    )
    if (err) throw new Error(err.message)
    return data?.items ?? []
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

  async function createBatch(payload: PromoBatchInput): Promise<PromoBatchCreated> {
    const { data, error: err } = await invokeEdge<PromoBatchCreated>(
      'admin-promo-codes/batch',
      { method: 'POST', body: payload },
    )
    if (err) throw new Error(err.message)
    if (!data) throw new Error('empty_response')
    // * Optimistically push to local batches list so the UI updates right away.
    batches.value.unshift({
      batch_id: data.batch_id,
      count: data.count,
      used_count: 0,
      amount: payload.amount,
      min_subtotal: payload.min_subtotal,
      absorbs_by: payload.absorbs_by,
      valid_from: payload.valid_from,
      valid_until: payload.valid_until,
      note: payload.note,
      club_id: payload.club_id,
      created_at: new Date().toISOString(),
    })
    return data
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

  async function removeBatch(batchId: string) {
    const { error: err } = await invokeEdge<{ ok: true }>('admin-promo-codes/batch', {
      method: 'DELETE',
      query: { id: batchId },
    })
    if (err) throw new Error(err.message)
    batches.value = batches.value.filter((b) => b.batch_id !== batchId)
  }

  return {
    items,
    batches,
    loading,
    loadingBatches,
    error,
    status,
    batchStatus,
    fetchAll,
    fetchBatches,
    fetchBatchCodes,
    create,
    createBatch,
    update,
    remove,
    removeBatch,
  }
})
