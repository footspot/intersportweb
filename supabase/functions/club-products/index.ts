// * club-products — lists a club's products for Footspot's "Ma boutique"
// * per-product discount editor (caller: Footspot's intersport-fetch-products).
// *
// * Auth is the shop-personalization inbound pattern: HMAC + per-club Bearer.
// * The Bearer resolves to a club; intersport_club_id in the body must match it
// * (SHOP_PERSONALIZATION_GUIDE.md §"club-products").
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { verifyFootspotClubAuth } from '../_shared/footspot/inbound.ts'

function fail(status: number, error: string, message: string) {
  return jsonResponse({ ok: false, error, message }, { status })
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'POST only')

  const auth = await verifyFootspotClubAuth(req)
  if (!auth.ok) return fail(auth.status, auth.error, 'Authentication failed')

  let payload: { intersport_club_id?: unknown }
  try {
    payload = JSON.parse(auth.body)
  } catch {
    return fail(400, 'invalid_json', 'Request body is not valid JSON')
  }
  if (payload.intersport_club_id !== auth.clubId) {
    return fail(403, 'forbidden_cross_club',
      'intersport_club_id does not match the authenticated club')
  }

  const sb = serviceClient()

  // * Every visible product sold to this club.
  const { data: products, error: pErr } = await sb
    .from('products')
    .select('id, reference, name, category, buying_price, selling_price')
    .eq('club_id', auth.clubId)
    .eq('is_visible', true)
  if (pErr) {
    console.error('[club-products] product lookup', pErr)
    return fail(500, 'lookup_failed', pErr.message)
  }
  if (!products || products.length === 0) {
    return jsonResponse({ products: [] })
  }

  const productIds = products.map((p) => p.id)

  // * Bundle component products are not directly sellable cards — exclude them,
  // * matching what the storefront listing shows.
  const componentIds = new Set<string>()
  const { data: bcs } = await sb
    .from('bundle_components')
    .select('component_product_id')
    .in('bundle_product_id', productIds)
  for (const b of bcs ?? []) componentIds.add((b as any).component_product_id)

  // * Primary image per product (lowest position wins).
  const imageByProduct = new Map<string, string>()
  const { data: images } = await sb
    .from('product_images')
    .select('product_id, image_path, position')
    .in('product_id', productIds)
    .order('position', { ascending: true })
  for (const img of images ?? []) {
    const pid = (img as any).product_id
    if (!imageByProduct.has(pid)) imageByProduct.set(pid, (img as any).image_path)
  }

  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')

  const out = products
    .filter((p) => !componentIds.has(p.id))
    .map((p) => {
      const selling = Number(p.selling_price)
      const buying = Number(p.buying_price)
      // * club_margin_pct — the part the club keeps; a discount may not exceed
      // * it. The update-product-discounts margin guard is authoritative; this
      // * value only drives the editor's input clamp.
      const marginPct = selling > 0 ? Math.floor(((selling - buying) / selling) * 100) : 0
      const path = imageByProduct.get(p.id)
      const name = (p.name as any)?.fr ?? (p.name as any)?.en ?? ''
      return {
        product_reference: p.reference,
        name,
        category: p.category ?? null,
        price_cents: Math.round(selling * 100),     // * pre-discount catalogue price
        margin_pct: marginPct,
        image_url: path ? `${base}/storage/v1/object/public/product-images/${path}` : null,
      }
    })

  return jsonResponse({ products: out })
})
