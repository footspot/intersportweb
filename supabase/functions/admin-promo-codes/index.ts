// * admin-promo-codes — CRUD for promo codes. Admin only.
// *
// * The `code` and `amount` are immutable once created (an admin can delete
// * unused codes, then re-create). Mutable: min_subtotal, valid_from,
// * valid_until, absorbs_by, note. Deletion only allowed while used_at IS NULL.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'

interface PromoPayload {
  id?: string
  code?: string
  amount?: number
  min_subtotal?: number | null
  absorbs_by?: 'intersport' | 'club'
  valid_from?: string | null
  valid_until?: string | null
  note?: string | null
}

function sanitiseCode(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (trimmed.length < 3 || trimmed.length > 32) return null
  if (!/^[A-Z0-9_-]+$/.test(trimmed)) return null
  return trimmed
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const guard = await verifyAdmin(req)
  if (guard instanceof Response) return guard

  const sb = serviceClient()
  const url = new URL(req.url)

  try {
    if (req.method === 'GET') {
      const status = url.searchParams.get('status')
      let query = sb.from('promo_codes').select('*').order('created_at', { ascending: false })
      const now = new Date().toISOString()
      if (status === 'active') {
        query = query.is('used_at', null).or(`valid_until.is.null,valid_until.gt.${now}`)
      } else if (status === 'used') {
        query = query.not('used_at', 'is', null)
      } else if (status === 'expired') {
        query = query.is('used_at', null).lt('valid_until', now)
      }
      const { data, error } = await query
      if (error) throw error
      return jsonResponse({ items: data ?? [] })
    }

    if (req.method === 'POST') {
      const body = (await req.json()) as PromoPayload
      const code = sanitiseCode(body.code)
      const amount = Number(body.amount)
      if (!code) return jsonResponse({ error: 'invalid_code' }, { status: 400 })
      if (!isFinite(amount) || amount <= 0) {
        return jsonResponse({ error: 'invalid_amount' }, { status: 400 })
      }
      const minSubtotal =
        body.min_subtotal != null && body.min_subtotal !== ''
          ? Number(body.min_subtotal)
          : null
      if (minSubtotal != null && (!isFinite(minSubtotal) || minSubtotal < amount)) {
        return jsonResponse({ error: 'invalid_min_subtotal' }, { status: 400 })
      }
      const absorbsBy = body.absorbs_by === 'club' ? 'club' : 'intersport'

      const { data, error } = await sb
        .from('promo_codes')
        .insert({
          code,
          amount,
          min_subtotal: minSubtotal,
          absorbs_by: absorbsBy,
          valid_from: body.valid_from || null,
          valid_until: body.valid_until || null,
          note: body.note?.trim() || null,
          created_by: guard.id,
        })
        .select()
        .single()
      if (error) {
        if ((error as any).code === '23505') {
          return jsonResponse({ error: 'code_already_exists' }, { status: 409 })
        }
        throw error
      }
      return jsonResponse({ promo: data }, { status: 201 })
    }

    if (req.method === 'PUT') {
      const body = (await req.json()) as PromoPayload
      if (!body.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: existing, error: fetchErr } = await sb
        .from('promo_codes')
        .select('id, amount, used_at')
        .eq('id', body.id)
        .single()
      if (fetchErr || !existing) {
        return jsonResponse({ error: 'not_found' }, { status: 404 })
      }
      if (existing.used_at) {
        return jsonResponse({ error: 'code_already_used' }, { status: 409 })
      }

      const patch: Record<string, unknown> = {}
      if (body.min_subtotal !== undefined) {
        if (body.min_subtotal === null) {
          patch.min_subtotal = null
        } else {
          const n = Number(body.min_subtotal)
          if (!isFinite(n) || n < Number(existing.amount)) {
            return jsonResponse({ error: 'invalid_min_subtotal' }, { status: 400 })
          }
          patch.min_subtotal = n
        }
      }
      if (body.absorbs_by !== undefined) {
        patch.absorbs_by = body.absorbs_by === 'club' ? 'club' : 'intersport'
      }
      if (body.valid_from !== undefined) patch.valid_from = body.valid_from || null
      if (body.valid_until !== undefined) patch.valid_until = body.valid_until || null
      if (body.note !== undefined) patch.note = body.note?.trim() || null

      const { data, error } = await sb
        .from('promo_codes')
        .update(patch)
        .eq('id', body.id)
        .select()
        .single()
      if (error) throw error
      return jsonResponse({ promo: data })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: existing } = await sb
        .from('promo_codes')
        .select('id, used_at')
        .eq('id', id)
        .single()
      if (!existing) return jsonResponse({ error: 'not_found' }, { status: 404 })
      if (existing.used_at) {
        return jsonResponse({ error: 'code_already_used' }, { status: 409 })
      }
      const { error } = await sb.from('promo_codes').delete().eq('id', id)
      if (error) throw error
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-promo-codes]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
