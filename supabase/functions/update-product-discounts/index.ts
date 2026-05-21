// * update-product-discounts — Footspot pushes a club's per-product discounts.
// *
// * All-or-nothing: every row is validated (existence + margin guard) before
// * anything is written. If any row fails, the whole batch is rejected with 422
// * and Intersport state is left untouched (SHOP_PERSONALIZATION_GUIDE.md §2).
// *
// * Margin guard — the discount is absorbed entirely by the club's margin.
// * This codebase models price as buying_price (Intersport's take, the hard
// * floor) + club margin, so club_margin_pct = (selling − buying) / selling.
// * A discount above that pushes the club margin negative → rejected.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { verifyFootspotClubAuth } from '../_shared/footspot/inbound.ts'

const MAX_DISCOUNT = 80

interface DiscountRowIn {
  product_reference?: unknown
  discount_pct?: unknown
}

function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return jsonResponse({ ok: false, error, message, ...extra }, { status })
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'POST only')

  const auth = await verifyFootspotClubAuth(req)
  if (!auth.ok) return fail(auth.status, auth.error, 'Authentication failed')

  let payload: { intersport_club_id?: unknown; discounts?: unknown }
  try {
    payload = JSON.parse(auth.body)
  } catch {
    return fail(400, 'invalid_json', 'Request body is not valid JSON')
  }

  if (payload.intersport_club_id !== auth.clubId) {
    return fail(403, 'forbidden_cross_club',
      'intersport_club_id does not match the authenticated club')
  }
  if (!Array.isArray(payload.discounts)) {
    return fail(400, 'invalid_payload', 'discounts must be an array')
  }

  // * Normalise + range-check every row before touching the database.
  const rows: { product_reference: string; discount_pct: number }[] = []
  for (const raw of payload.discounts as DiscountRowIn[]) {
    const ref = typeof raw?.product_reference === 'string' ? raw.product_reference.trim() : ''
    const pct = Number(raw?.discount_pct)
    if (!ref) {
      return fail(422, 'invalid_payload', 'each discount row needs a product_reference')
    }
    if (!Number.isInteger(pct) || pct < 0 || pct > MAX_DISCOUNT) {
      return fail(422, 'discount_out_of_range',
        `discount_pct must be an integer between 0 and ${MAX_DISCOUNT}`,
        { product_reference: ref, discount_pct: raw?.discount_pct ?? null })
    }
    rows.push({ product_reference: ref, discount_pct: pct })
  }

  const syncedAt = new Date().toISOString()
  if (rows.length === 0) {
    return jsonResponse({ ok: true, applied: 0, synced_at: syncedAt })
  }

  const sb = serviceClient()

  // * Resolve every reference to a product owned by THIS club.
  const refs = Array.from(new Set(rows.map((r) => r.product_reference)))
  const { data: products, error: pErr } = await sb
    .from('products')
    .select('reference, club_id, buying_price, selling_price')
    .in('reference', refs)
  if (pErr) {
    console.error('[update-product-discounts] product lookup', pErr)
    return fail(500, 'lookup_failed', pErr.message)
  }
  const byRef = new Map((products ?? []).map((p) => [p.reference, p]))

  // * Validate every row. Collect — never short-circuit — so the director
  // * sees the full list of what to fix.
  const rejected: Record<string, unknown>[] = []
  for (const row of rows) {
    const p = byRef.get(row.product_reference)
    if (!p || p.club_id !== auth.clubId) {
      rejected.push({ product_reference: row.product_reference, reason: 'product_not_found' })
      continue
    }
    const selling = Number(p.selling_price)
    const buying = Number(p.buying_price)
    const marginPct = selling > 0 ? ((selling - buying) / selling) * 100 : 0
    // * discount_pct is an integer; allow a hair of float slack on the margin.
    if (row.discount_pct > marginPct + 1e-9) {
      rejected.push({
        product_reference: row.product_reference,
        reason: 'discount_exceeds_margin',
        margin_pct: Math.floor(marginPct),
      })
    }
  }
  if (rejected.length > 0) {
    return jsonResponse(
      {
        ok: false,
        error: 'batch_rejected',
        message: 'One or more discounts were rejected; no change was applied.',
        rejected,
      },
      { status: 422 },
    )
  }

  // * All rows passed. The single upsert is atomic; UNIQUE(club_id,
  // * product_reference) is the conflict target. Repeating the same payload
  // * (e.g. an X-Idempotency-Key replay) produces the identical row set.
  const upsertRows = rows.map((r) => ({
    club_id: auth.clubId,
    product_reference: r.product_reference,
    discount_pct: r.discount_pct,
    updated_at: syncedAt,
    updated_via: 'footspot',
  }))
  const { error: uErr } = await sb
    .from('product_discounts')
    .upsert(upsertRows, { onConflict: 'club_id,product_reference' })
  if (uErr) {
    console.error('[update-product-discounts] upsert', uErr)
    return fail(500, 'upsert_failed', uErr.message)
  }

  return jsonResponse({ ok: true, applied: rows.length, synced_at: syncedAt })
})
