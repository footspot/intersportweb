// * cart-validate — re-reads stock + pricing for every line right before checkout.
// * Bundle lines (variant_id null) resolve to component variants via bundle_components
// * and check each component's stock against the picked (size, secondary_size) pair.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { computeUnitPricing, type DiscountSource } from '../_shared/pricing.ts'

interface CartLineIn {
  line_id: string
  product_id: string
  variant_id: string | null
  size: string                          // * primary size for bundles
  secondary_size?: string | null        // * secondary size for bundles
  quantity: number
  unit_price_paid: number
}

type Reason =
  | 'not_found'
  | 'not_visible'
  | 'out_of_stock'
  | 'price_changed'
  | 'variant_missing'
  | 'bundle_component_missing'
  | 'bundle_unavailable'

interface LineResult {
  line_id: string
  ok: boolean
  reason?: Reason
  available_stock?: number
  current_price?: number
  current_buying?: number
  current_discount_percent?: number
  current_discount_source?: DiscountSource | null
  current_fund_credit?: number
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  }

  const sb = serviceClient()

  try {
    const body = (await req.json()) as { lines: CartLineIn[] }
    if (!Array.isArray(body?.lines)) {
      return jsonResponse({ error: 'lines array required' }, { status: 400 })
    }
    if (body.lines.length === 0) {
      return jsonResponse({ ok: true, all_ok: true, lines: [] })
    }

    const productIds = Array.from(new Set(body.lines.map((l) => l.product_id)))
    const variantIds = Array.from(
      new Set(body.lines.map((l) => l.variant_id).filter((v): v is string => !!v)),
    )

    const { data: products, error: pErr } = await sb
      .from('products')
      .select('id, is_pack, buying_price, selling_price, discount_percent, discount_source, is_visible, available_from')
      .in('id', productIds)
    if (pErr) throw pErr
    const productMap = new Map((products ?? []).map((p: any) => [p.id, p]))

    const variantMap = new Map<string, any>()
    if (variantIds.length) {
      const { data: variants, error: vErr } = await sb
        .from('product_variants')
        .select('id, product_id, stock, size')
        .in('id', variantIds)
      if (vErr) throw vErr
      for (const v of variants ?? []) variantMap.set((v as any).id, v)
    }

    // * Preload bundle_components + their variants for any bundle lines.
    const bundleIds = body.lines
      .filter((l) => productMap.get(l.product_id)?.is_pack)
      .map((l) => l.product_id)
    const bundleCompMap = new Map<string, any[]>()            // bundle_id → [{component_product_id, axis, quantity}]
    const compVariantsMap = new Map<string, any[]>()          // component_product_id → [{id, size, stock}]
    if (bundleIds.length) {
      const { data: bcs } = await sb
        .from('bundle_components')
        .select('bundle_product_id, component_product_id, axis, quantity')
        .in('bundle_product_id', bundleIds)
      for (const row of bcs ?? []) {
        const list = bundleCompMap.get((row as any).bundle_product_id) ?? []
        list.push(row)
        bundleCompMap.set((row as any).bundle_product_id, list)
      }
      const compIds = Array.from(
        new Set((bcs ?? []).map((r: any) => r.component_product_id)),
      )
      if (compIds.length) {
        const { data: cvs } = await sb
          .from('product_variants')
          .select('id, product_id, size, stock')
          .in('product_id', compIds)
        for (const v of cvs ?? []) {
          const list = compVariantsMap.get((v as any).product_id) ?? []
          list.push(v)
          compVariantsMap.set((v as any).product_id, list)
        }
      }
    }

    const out: LineResult[] = body.lines.map((l) => {
      const product = productMap.get(l.product_id)
      if (!product) return { line_id: l.line_id, ok: false, reason: 'not_found' }
      if (!product.is_visible) return { line_id: l.line_id, ok: false, reason: 'not_visible' }

      const pricing = computeUnitPricing({
        buying_price: Number(product.buying_price),
        selling_price: Number(product.selling_price),
        discount_percent: Number(product.discount_percent ?? 0),
        discount_source: product.discount_source ?? null,
      })

      if (product.is_pack) {
        // * Resolve each component variant by size axis
        const comps = bundleCompMap.get(l.product_id) ?? []
        if (comps.length === 0) {
          return { line_id: l.line_id, ok: false, reason: 'bundle_unavailable' }
        }
        let minAvailable = Infinity
        for (const c of comps) {
          const desiredSize = c.axis === 'primary' ? l.size : (l.secondary_size ?? '')
          if (!desiredSize) {
            return { line_id: l.line_id, ok: false, reason: 'bundle_component_missing' }
          }
          const vs = compVariantsMap.get(c.component_product_id) ?? []
          const v = vs.find((x: any) => x.size === desiredSize)
          if (!v) {
            return { line_id: l.line_id, ok: false, reason: 'bundle_component_missing' }
          }
          const needed = c.quantity * l.quantity
          if (v.stock < needed) {
            return {
              line_id: l.line_id,
              ok: false,
              reason: 'out_of_stock',
              available_stock: Math.floor(v.stock / c.quantity),
            }
          }
          minAvailable = Math.min(minAvailable, Math.floor(v.stock / c.quantity))
        }

        if (Math.abs(pricing.unit_price_paid - Number(l.unit_price_paid)) > 0.005) {
          return {
            line_id: l.line_id,
            ok: false,
            reason: 'price_changed',
            current_price: pricing.unit_price_paid,
            current_buying: Number(product.buying_price),
            current_discount_percent: Number(product.discount_percent ?? 0),
            current_discount_source: product.discount_source ?? null,
            current_fund_credit: pricing.club_fund_per_unit,
          }
        }

        return {
          line_id: l.line_id,
          ok: true,
          available_stock: minAvailable === Infinity ? 0 : minAvailable,
          current_price: pricing.unit_price_paid,
          current_buying: Number(product.buying_price),
          current_discount_percent: Number(product.discount_percent ?? 0),
          current_discount_source: product.discount_source ?? null,
          current_fund_credit: pricing.club_fund_per_unit,
        }
      }

      // * Non-bundle
      if (!l.variant_id) {
        return { line_id: l.line_id, ok: false, reason: 'variant_missing' }
      }
      const variant = variantMap.get(l.variant_id)
      if (!variant || variant.product_id !== l.product_id) {
        return { line_id: l.line_id, ok: false, reason: 'variant_missing' }
      }
      if (variant.stock < l.quantity && !product.available_from) {
        return { line_id: l.line_id, ok: false, reason: 'out_of_stock', available_stock: variant.stock }
      }

      if (Math.abs(pricing.unit_price_paid - Number(l.unit_price_paid)) > 0.005) {
        return {
          line_id: l.line_id,
          ok: false,
          reason: 'price_changed',
          current_price: pricing.unit_price_paid,
          current_buying: Number(product.buying_price),
          current_discount_percent: Number(product.discount_percent ?? 0),
          current_discount_source: product.discount_source ?? null,
          current_fund_credit: pricing.club_fund_per_unit,
        }
      }

      return {
        line_id: l.line_id,
        ok: true,
        available_stock: variant.stock,
        current_price: pricing.unit_price_paid,
        current_buying: Number(product.buying_price),
        current_discount_percent: Number(product.discount_percent ?? 0),
        current_discount_source: product.discount_source ?? null,
        current_fund_credit: pricing.club_fund_per_unit,
      }
    })

    const allOk = out.every((r) => r.ok)
    return jsonResponse({ ok: true, all_ok: allOk, lines: out })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[cart-validate]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
