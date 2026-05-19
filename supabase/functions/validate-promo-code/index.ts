// * validate-promo-code — public; checks a code against a cart subtotal.
// *
// * Returns the discount amount + absorbs_by so the storefront can display
// * the discounted total before checkout. This is a non-binding preview —
// * the actual claim is atomic at payment-success (process_paid_order).
// * Multiple customers can hold the same valid code simultaneously.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'

interface Payload {
  code?: string
  subtotal?: number
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  }

  const sb = serviceClient()

  try {
    const body = (await req.json()) as Payload
    const code = (body?.code ?? '').trim().toUpperCase().replace(/\s+/g, '')
    const subtotal = Number(body?.subtotal ?? 0)
    if (!code || code.length < 3) {
      return jsonResponse({ valid: false, reason: 'invalid_code' })
    }
    if (!isFinite(subtotal) || subtotal < 0) {
      return jsonResponse({ valid: false, reason: 'invalid_subtotal' })
    }

    const { data: promo, error } = await sb
      .from('promo_codes')
      .select('id, code, amount, min_subtotal, absorbs_by, valid_from, valid_until, used_at')
      .ilike('code', code)
      .maybeSingle()
    if (error) throw error
    if (!promo) {
      return jsonResponse({ valid: false, reason: 'unknown_code' })
    }
    if (promo.used_at) {
      return jsonResponse({ valid: false, reason: 'already_used' })
    }
    const now = new Date()
    if (promo.valid_from && new Date(promo.valid_from) > now) {
      return jsonResponse({ valid: false, reason: 'not_yet_active' })
    }
    if (promo.valid_until && new Date(promo.valid_until) < now) {
      return jsonResponse({ valid: false, reason: 'expired' })
    }
    if (promo.min_subtotal != null && subtotal < Number(promo.min_subtotal)) {
      return jsonResponse({
        valid: false,
        reason: 'below_min_subtotal',
        min_subtotal: Number(promo.min_subtotal),
      })
    }

    return jsonResponse({
      valid: true,
      promo_code_id: promo.id,
      code: promo.code,
      amount: Number(promo.amount),
      absorbs_by: promo.absorbs_by,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[validate-promo-code]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
