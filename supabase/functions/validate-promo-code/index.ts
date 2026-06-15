// * validate-promo-code — public; checks a code against a cart.
// *
// * Returns the discount amount + absorbs_by so the storefront can display
// * the discounted total before checkout. This is a non-binding preview —
// * the actual claim is atomic at payment-success (process_paid_order), and
// * create-order recomputes the eligible discount from trusted product data,
// * so a tampered cart only affects the preview, never the charge.
// *
// * Scope (promo_codes.scope):
// *   - global   → discount applies to the whole cart.
// *   - club     → only lines whose product belongs to promo.club_id count.
// *   - products → only lines in promo.scope_product_ids count.
// * Eligible subtotal = sum of matching lines; discount = min(amount, eligible).
// * min_subtotal is checked against the ELIGIBLE subtotal, not the whole cart.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'

interface LineIn {
  product_id?: string
  club_id?: string
  line_total?: number // * unit_price_paid * quantity for this line
}

interface Payload {
  code?: string
  subtotal?: number // * legacy/fallback; used for global scope when lines absent
  lines?: LineIn[]
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
    const lines = Array.isArray(body?.lines) ? body.lines : []
    const linesSubtotal = lines.reduce((s, l) => s + Math.max(0, Number(l?.line_total) || 0), 0)
    // * Prefer the summed lines; fall back to the legacy `subtotal` field.
    const subtotal = lines.length ? linesSubtotal : Number(body?.subtotal ?? 0)
    if (!code || code.length < 3) {
      return jsonResponse({ valid: false, reason: 'invalid_code' })
    }
    if (!isFinite(subtotal) || subtotal < 0) {
      return jsonResponse({ valid: false, reason: 'invalid_subtotal' })
    }

    const { data: promo, error } = await sb
      .from('promo_codes')
      .select(
        'id, code, amount, min_subtotal, absorbs_by, valid_from, valid_until, used_at, scope, club_id, scope_product_ids',
      )
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

    // * Eligible subtotal depends on scope. For scoped codes we need the cart
    // * lines: without them we can't tell which items qualify → not applicable.
    let eligible = subtotal
    if (promo.scope === 'club') {
      eligible = lines.reduce(
        (s, l) => (l?.club_id && l.club_id === promo.club_id ? s + (Number(l.line_total) || 0) : s),
        0,
      )
    } else if (promo.scope === 'products') {
      const set = new Set<string>((promo.scope_product_ids ?? []) as string[])
      eligible = lines.reduce(
        (s, l) => (l?.product_id && set.has(l.product_id) ? s + (Number(l.line_total) || 0) : s),
        0,
      )
    }
    eligible = Number(eligible.toFixed(2))

    if (promo.scope !== 'global' && eligible <= 0) {
      return jsonResponse({ valid: false, reason: 'not_applicable_to_cart' })
    }
    if (promo.min_subtotal != null && eligible < Number(promo.min_subtotal)) {
      return jsonResponse({
        valid: false,
        reason: 'below_min_subtotal',
        min_subtotal: Number(promo.min_subtotal),
      })
    }

    const discount = Number(Math.min(Number(promo.amount), eligible).toFixed(2))

    return jsonResponse({
      valid: true,
      promo_code_id: promo.id,
      code: promo.code,
      // * `amount` is the discount that will actually apply (capped at eligible).
      amount: discount,
      full_amount: Number(promo.amount),
      absorbs_by: promo.absorbs_by,
      scope: promo.scope,
      eligible_subtotal: eligible,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[validate-promo-code]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
