// * create-order — supersedes checkout-start.
// *
// * Single entrypoint for placing an order. Supports both authenticated and
// * guest checkout, all three delivery methods (colissimo / club_pickup /
// * shop_pickup), and a client-supplied idempotency_key so retries return the
// * same order instead of duplicating.
// *
// * The actual payment step happens AFTER this call: the frontend takes the
// * returned access_token + order_id and renders the SystemPay Smartform via
// * create-form-token.
// *
// * Validation owners:
// *   - pricing / stock  — recomputed server-side from products + variants
// *   - delivery method  — must be enabled on the order's club row
// *   - pickup target    — pickup_shop_id required iff shop_pickup, club_id
// *                        + customer's chosen club required iff club_pickup
// *   - guest identity   — guest_email + first/last names required when no
// *                        Authorization header is present
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { postFootspot } from '../_shared/footspot/client.ts'
import { computeUnitPricing, applyClubDiscount, type DiscountSource } from '../_shared/pricing.ts'

type DeliveryMethod = 'colissimo' | 'club_pickup' | 'shop_pickup'

interface CartLineIn {
  product_id: string
  variant_id: string | null
  size: string
  secondary_size?: string | null
  quantity: number
  flocking?: { name?: string | null; initial?: string | null; number?: string | null }
}

interface ShippingAddress {
  full_name: string
  email?: string
  phone?: string
  line1: string
  line2?: string
  postal_code: string
  city: string
  country: string
}

interface CreateOrderPayload {
  idempotency_key?: string
  lines: CartLineIn[]
  delivery_method: DeliveryMethod
  shipping_address?: ShippingAddress
  pickup_shop_id?: string
  club_id?: string
  guest?: { email: string; first_name: string; last_name: string; phone?: string }
  promo_code_id?: string
  prepaid_code?: string
  footspot_member_id?: string
}

function orderNumber(): string {
  const year = new Date().getFullYear()
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `CMD-${year}-${rand}`
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

function isUuid(s: string | undefined | null): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

const SHIPPING_COST_DEFAULT = 6.9

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const sb = serviceClient()

  try {
    const body = (await req.json()) as CreateOrderPayload
    if (!Array.isArray(body?.lines) || body.lines.length === 0) {
      return jsonResponse({ error: 'cart_empty' }, { status: 400 })
    }
    if (!body.delivery_method || !['colissimo', 'club_pickup', 'shop_pickup'].includes(body.delivery_method)) {
      return jsonResponse({ error: 'invalid_delivery_method' }, { status: 400 })
    }

    // * Every order is a guest order — the storefront has no login. We
    // * intentionally ignore any Authorization header here (the JS client
    // * attaches the anon publishable key by default, which would otherwise
    // * look like a session).

    if (!body.guest || !body.guest.email || !body.guest.first_name || !body.guest.last_name) {
      return jsonResponse({ error: 'guest_identity_required' }, { status: 400 })
    }
    if (!isValidEmail(body.guest.email)) {
      return jsonResponse({ error: 'guest_email_invalid' }, { status: 400 })
    }
    // * Phone is mandatory for every order — carriers and pickup notifications
    // * both need a reachable number.
    if (!body.guest.phone?.trim()) {
      return jsonResponse({ error: 'guest_phone_required' }, { status: 400 })
    }

    // * Idempotency short-circuit. Same key → same order (regardless of body).
    if (body.idempotency_key) {
      if (!isUuid(body.idempotency_key)) {
        return jsonResponse({ error: 'idempotency_key_invalid' }, { status: 400 })
      }
      const { data: existing } = await sb
        .from('orders')
        .select('id, access_token, total, order_number, status')
        .eq('idempotency_key', body.idempotency_key)
        .maybeSingle()
      if (existing) {
        return jsonResponse({
          ok: true,
          duplicate: true,
          order: {
            id: existing.id,
            access_token: existing.access_token,
            number: existing.order_number,
            total: existing.total,
            status: existing.status,
          },
        })
      }
    }

    // * Delivery-method specific input checks.
    if (body.delivery_method === 'colissimo') {
      const a = body.shipping_address
      if (!a?.full_name || !a.line1 || !a.postal_code || !a.city || !a.country) {
        return jsonResponse({ error: 'shipping_address_incomplete' }, { status: 400 })
      }
      // * Guest path collects phone on the customer-info step and the client
      // * merges it into shipping_address. Logged-in users don't have a phone
      // * input yet (profile schema lacks the column); accept the order
      // * without one and let the admin chase a contact if needed.
      if (!a.phone?.trim()) {
        return jsonResponse({ error: 'shipping_phone_required' }, { status: 400 })
      }
    } else if (body.delivery_method === 'shop_pickup') {
      if (!isUuid(body.pickup_shop_id)) {
        return jsonResponse({ error: 'pickup_shop_required' }, { status: 400 })
      }
      const { data: shop } = await sb
        .from('intersport_shops')
        .select('id, is_active')
        .eq('id', body.pickup_shop_id)
        .maybeSingle()
      if (!shop || !shop.is_active) {
        return jsonResponse({ error: 'pickup_shop_invalid' }, { status: 400 })
      }
    }
    // * club_pickup: target is the club the products belong to (validated below).

    // * Server-side product/variant fetch + integrity checks. Bundles
    // * (is_pack=true) resolve to component variants via bundle_components.
    const productIds = Array.from(new Set(body.lines.map((l) => l.product_id)))
    const variantIds = Array.from(
      new Set(body.lines.map((l) => l.variant_id).filter((v): v is string => !!v)),
    )

    const { data: products, error: pErr } = await sb
      .from('products')
      .select(
        'id, club_id, name, reference, is_pack, buying_price, selling_price, discount_percent, discount_source, is_visible, weight_grams',
      )
      .in('id', productIds)
    if (pErr) throw pErr
    const productMap = new Map((products ?? []).map((p: any) => [p.id, p]))

    const variantMap = new Map<string, any>()
    if (variantIds.length) {
      const { data: variants, error: vErr } = await sb
        .from('product_variants')
        .select('id, product_id, size, stock')
        .in('id', variantIds)
      if (vErr) throw vErr
      for (const v of variants ?? []) variantMap.set((v as any).id, v)
    }

    const bundleIds = body.lines
      .filter((l) => productMap.get(l.product_id)?.is_pack)
      .map((l) => l.product_id)
    const bundleCompMap = new Map<string, any[]>()
    const compVariantsMap = new Map<string, any[]>()
    const compProductMap = new Map<string, any>()
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
      const compIds = Array.from(new Set((bcs ?? []).map((r: any) => r.component_product_id)))
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
        const { data: cps } = await sb
          .from('products')
          .select('id, buying_price')
          .in('id', compIds)
        for (const cp of cps ?? []) compProductMap.set((cp as any).id, cp)
      }
    }

    // * Footspot per-club discounts (SHOP_PERSONALIZATION_GUIDE.md §3.3).
    // * Keyed by `${club_id}|${reference}`. The buyer pays the discounted
    // * price; the cut is absorbed entirely by the club's margin — Intersport's
    // * margin (buying_price) is never touched.
    const discountMap = new Map<string, number>()
    {
      const refs = Array.from(new Set((products ?? []).map((p: any) => p.reference)))
      if (refs.length) {
        const { data: discs } = await sb
          .from('product_discounts')
          .select('club_id, product_reference, discount_pct')
          .in('product_reference', refs)
          .gt('discount_pct', 0)
        for (const d of discs ?? []) {
          discountMap.set(`${(d as any).club_id}|${(d as any).product_reference}`, (d as any).discount_pct)
        }
      }
    }

    interface PendingItem {
      productId: string
      variantId: string | null
      quantity: number
      size: string
      secondarySize: string | null
      pricing: ReturnType<typeof computeUnitPricing>
      buyingSnapshot: number
      footspotPct: number
      unitPaid: number          // * post-footspot-discount price the buyer pays
      fundPerUnit: number       // * club fund credit per unit, post-discount
      product: any
      flocking: CartLineIn['flocking']
      bundleComponents?: Array<{
        component_product_id: string
        component_variant_id: string
        axis: 'primary' | 'secondary'
        quantity_per_unit: number
        unit_buying_price_snapshot: number
      }>
    }

    const pending: PendingItem[] = []
    let subtotal = 0
    // * A cart may span multiple clubs. We collect every club represented so the
    // * order can be validated against all of them and the fund credited per
    // * item's own club (process_paid_order reads products.club_id per line).
    const clubIdSet = new Set<string>()

    for (const line of body.lines) {
      const product = productMap.get(line.product_id)
      if (!product || !product.is_visible) {
        return jsonResponse({ error: 'product_unavailable', product_id: line.product_id }, { status: 409 })
      }

      const pricing = computeUnitPricing({
        buying_price: Number(product.buying_price),
        selling_price: Number(product.selling_price),
        discount_percent: Number(product.discount_percent ?? 0),
        discount_source: product.discount_source ?? null,
      })
      const buyingSnapshot =
        product.discount_source === 'intersport'
          ? Number(product.buying_price) -
            (Number(product.selling_price) * Number(product.discount_percent ?? 0)) / 100
          : Number(product.buying_price)

      // * Layer the Footspot club discount on top of the catalogue price. The
      // * reduction comes straight out of the club fund credit.
      const footspotPct = discountMap.get(`${product.club_id}|${product.reference}`) ?? 0
      const unitPaid = applyClubDiscount(pricing.unit_price_paid, footspotPct)
      const fundPerUnit = Number(
        (pricing.club_fund_per_unit - (pricing.unit_price_paid - unitPaid)).toFixed(2),
      )

      if (product.is_pack) {
        const comps = bundleCompMap.get(line.product_id) ?? []
        if (comps.length === 0) {
          return jsonResponse({ error: 'bundle_unavailable', product_id: line.product_id }, { status: 409 })
        }
        const resolved: PendingItem['bundleComponents'] = []
        for (const c of comps) {
          const desiredSize = c.axis === 'primary' ? line.size : (line.secondary_size ?? '')
          if (!desiredSize) {
            return jsonResponse(
              { error: 'bundle_component_missing', product_id: line.product_id, axis: c.axis },
              { status: 409 },
            )
          }
          const vs = compVariantsMap.get(c.component_product_id) ?? []
          const v = vs.find((x: any) => x.size === desiredSize)
          if (!v) {
            return jsonResponse(
              { error: 'bundle_component_missing', component_product_id: c.component_product_id },
              { status: 409 },
            )
          }
          const needed = c.quantity * line.quantity
          if (v.stock < needed) {
            return jsonResponse(
              { error: 'out_of_stock', variant_id: v.id, available_stock: v.stock },
              { status: 409 },
            )
          }
          resolved.push({
            component_product_id: c.component_product_id,
            component_variant_id: v.id,
            axis: c.axis,
            quantity_per_unit: c.quantity,
            unit_buying_price_snapshot: Number(compProductMap.get(c.component_product_id)?.buying_price ?? 0),
          })
        }
        pending.push({
          productId: product.id,
          variantId: null,
          quantity: line.quantity,
          size: line.size,
          secondarySize: line.secondary_size ?? null,
          pricing,
          buyingSnapshot,
          footspotPct,
          unitPaid,
          fundPerUnit,
          product,
          flocking: line.flocking,
          bundleComponents: resolved,
        })
      } else {
        if (!line.variant_id) {
          return jsonResponse({ error: 'variant_required', product_id: line.product_id }, { status: 400 })
        }
        const variant = variantMap.get(line.variant_id)
        if (!variant || variant.product_id !== line.product_id) {
          return jsonResponse({ error: 'variant_unavailable', variant_id: line.variant_id }, { status: 409 })
        }
        if (variant.stock < line.quantity) {
          return jsonResponse(
            { error: 'out_of_stock', variant_id: variant.id, available_stock: variant.stock },
            { status: 409 },
          )
        }
        pending.push({
          productId: product.id,
          variantId: variant.id,
          quantity: line.quantity,
          size: variant.size,
          secondarySize: null,
          pricing,
          buyingSnapshot,
          footspotPct,
          unitPaid,
          fundPerUnit,
          product,
          flocking: line.flocking,
        })
      }

      subtotal += unitPaid * line.quantity

      clubIdSet.add(product.club_id)
    }

    if (clubIdSet.size === 0) return jsonResponse({ error: 'missing_club' }, { status: 400 })
    const clubIds = Array.from(clubIdSet)
    const isMultiClub = clubIds.length > 1
    // * Single-club orders keep club_id on the row (preserves Footspot dispatch,
    // * per-club admin views, etc.). Mixed-club orders set it NULL — the source
    // * of truth for "which club" then becomes each item's products.club_id.
    const orderClubId = isMultiClub ? null : clubIds[0]

    // * club_pickup is inherently single-club (you collect at one club's site),
    // * so it's unavailable for mixed carts (product decision 2026-06-08).
    if (isMultiClub && body.delivery_method === 'club_pickup') {
      return jsonResponse({ error: 'club_pickup_multi_club' }, { status: 400 })
    }

    // * Validate the requested delivery_method against EVERY club in the cart:
    // * a mixed-cart shipment is only possible if all clubs allow that method.
    const { data: clubsRows, error: clubErr } = await sb
      .from('clubs')
      .select('id, delivery_colissimo_enabled, delivery_colissimo_free, delivery_club_pickup_enabled, delivery_shop_pickup_enabled')
      .in('id', clubIds)
    if (clubErr || !clubsRows || clubsRows.length !== clubIds.length) {
      return jsonResponse({ error: 'club_not_found' }, { status: 400 })
    }
    // * A Footspot disconnect only stops cross-platform sync — it does NOT take
    // * the Intersport storefront offline. The shop keeps accepting new orders
    // * regardless of footspot pairing state (per client decision 2026-06-05,
    // * overriding SHOP_PERSONALIZATION_GUIDE §2's original "refuse" behaviour).
    const allowed = clubsRows.every((club) =>
      (body.delivery_method === 'colissimo' && club.delivery_colissimo_enabled) ||
      (body.delivery_method === 'club_pickup' && club.delivery_club_pickup_enabled) ||
      (body.delivery_method === 'shop_pickup' && club.delivery_shop_pickup_enabled),
    )
    if (!allowed) {
      return jsonResponse({ error: 'delivery_method_not_enabled_for_club' }, { status: 400 })
    }

    // * Shipping cost: colissimo charges a flat 6.90 €, UNLESS every club in the
    // * cart offers free Colissimo delivery (admin "offered delivery" toggle).
    // * Pickup methods are always free to the customer.
    const colissimoFree = clubsRows.every((club) => club.delivery_colissimo_free)
    const shippingCost =
      body.delivery_method === 'colissimo' && !colissimoFree ? SHIPPING_COST_DEFAULT : 0

    // * Promo validation: re-verify the code server-side so a tampered client
    // *   can't claim a non-existent or expired code. The atomic claim itself
    // *   happens later at payment-success (IPN). If valid, snapshot the
    // *   discount on the order; on the promo race-loss path the full total
    // *   gets refunded so the discount value doesn't have to match reality.
    let promoCodeId: string | null = null
    let promoDiscount = 0
    if (body.promo_code_id) {
      if (!isUuid(body.promo_code_id)) {
        return jsonResponse({ error: 'promo_code_invalid' }, { status: 400 })
      }
      const { data: promo } = await sb
        .from('promo_codes')
        .select('id, amount, min_subtotal, valid_from, valid_until, used_at')
        .eq('id', body.promo_code_id)
        .maybeSingle()
      if (!promo) {
        return jsonResponse({ error: 'promo_code_not_found' }, { status: 400 })
      }
      if (promo.used_at) {
        return jsonResponse({ error: 'promo_code_already_used' }, { status: 400 })
      }
      const now = Date.now()
      if (promo.valid_from && new Date(promo.valid_from).getTime() > now) {
        return jsonResponse({ error: 'promo_code_not_yet_active' }, { status: 400 })
      }
      if (promo.valid_until && new Date(promo.valid_until).getTime() < now) {
        return jsonResponse({ error: 'promo_code_expired' }, { status: 400 })
      }
      if (promo.min_subtotal != null && subtotal < Number(promo.min_subtotal)) {
        return jsonResponse({ error: 'promo_code_below_min_subtotal' }, { status: 400 })
      }
      // * Cap the discount at the subtotal so total never goes negative.
      promoDiscount = Math.min(Number(promo.amount), subtotal)
      promoCodeId = promo.id
    }

    // * Prepaid: server-side re-validate against Footspot to capture the cap.
    // *   Never trust client-computed credit. If Footspot is unreachable we
    // *   reject the order so the customer can retry — better than letting them
    // *   slip through without applying the discount they expected.
    let prepaidCredit = 0
    let prepaidCodeRef: string | null = null
    let prepaidClubId: string | null = null
    let footspotMemberId: string | null = body.footspot_member_id ?? null
    if (body.prepaid_code?.trim()) {
      const bearer = Deno.env.get('INTERSPORT_FOOTSPOT_SERVICE_TOKEN')
      if (!bearer) {
        return jsonResponse({ error: 'prepaid_not_configured' }, { status: 500 })
      }
      const code = body.prepaid_code.trim().toUpperCase().replace(/\s+/g, '')
      const res = await postFootspot({
        path: 'intersport-validate-prepaid-code',
        bearer,
        body: { code },
      })
      if (!res.ok || !res.json) {
        return jsonResponse({ error: 'prepaid_upstream_unreachable' }, { status: 502 })
      }
      const fs = res.json as {
        valid?: boolean
        reason?: string
        prepaid_code_ref?: string
        member_id?: string
        club_id?: string
        cap_amount_cents?: number
      }
      if (!fs.valid) {
        return jsonResponse({ error: 'prepaid_code_invalid', reason: fs.reason ?? null }, { status: 400 })
      }
      const cap = Number(fs.cap_amount_cents ?? 0) / 100
      const afterPromo = subtotal - promoDiscount
      prepaidCredit = Math.min(cap, Math.max(0, afterPromo))
      prepaidCodeRef = fs.prepaid_code_ref ?? null
      prepaidClubId = fs.club_id ?? null
      footspotMemberId = fs.member_id ?? footspotMemberId
    }

    const total = Number((subtotal + shippingCost - promoDiscount - prepaidCredit).toFixed(2))
    const isFullyPrepaid = prepaidCredit > 0 && total <= 0

    // * For colissimo: keep the supplied shipping_address. For pickup methods
    // * we still need something in the JSONB column (NOT NULL), so we stash
    // * the buyer's identity + phone there as a stub the admin views read.
    let shippingAddress: ShippingAddress
    if (body.delivery_method === 'colissimo') {
      shippingAddress = {
        ...body.shipping_address!,
        email: body.shipping_address?.email ?? body.guest!.email,
      }
    } else {
      shippingAddress = {
        full_name: `${body.guest!.first_name} ${body.guest!.last_name}`.trim(),
        email: body.guest!.email,
        phone: body.guest?.phone ?? '',
        line1: '',
        line2: '',
        postal_code: '',
        city: '',
        country: 'France',
      }
    }

    const number = orderNumber()

    const { data: order, error: oErr } = await sb
      .from('orders')
      .insert({
        order_number: number,
        guest_email: body.guest!.email,
        guest_first_name: body.guest!.first_name,
        guest_last_name: body.guest!.last_name,
        idempotency_key: body.idempotency_key ?? null,
        club_id: orderClubId,
        status: 'pending',
        payment_method: null,
        subtotal: Number(subtotal.toFixed(2)),
        shipping_cost: shippingCost,
        total: Math.max(0, total),
        shipping_address: shippingAddress,
        delivery_method: body.delivery_method,
        pickup_shop_id: body.delivery_method === 'shop_pickup' ? body.pickup_shop_id : null,
        promo_code_id: promoCodeId,
        promo_discount: Number(promoDiscount.toFixed(2)),
        prepaid_code_ref: prepaidCodeRef,
        prepaid_credit: Number(prepaidCredit.toFixed(2)),
        prepaid_club_id: prepaidClubId,
        footspot_member_id: footspotMemberId,
        // * Fully-prepaid orders skip the IPN and land paid on the spot.
        payment_method: isFullyPrepaid ? 'prepaid' : null,
        status: isFullyPrepaid ? 'paid' : 'pending',
        paid_at: isFullyPrepaid ? new Date().toISOString() : null,
      })
      .select('id, order_number, access_token, total')
      .single()
    if (oErr) {
      // * Idempotency race: another concurrent request inserted the same key.
      // * Re-read and return that one.
      if (body.idempotency_key && (oErr.code === '23505' || /duplicate/i.test(oErr.message))) {
        const { data: existing } = await sb
          .from('orders')
          .select('id, access_token, total, order_number, status')
          .eq('idempotency_key', body.idempotency_key)
          .maybeSingle()
        if (existing) {
          return jsonResponse({
            ok: true,
            duplicate: true,
            order: {
              id: existing.id,
              access_token: existing.access_token,
              number: existing.order_number,
              total: existing.total,
              status: existing.status,
            },
          })
        }
      }
      throw oErr
    }

    // * Insert items one row at a time so each id is available for any
    // * bundle-component rows.
    for (const p of pending) {
      const { data: inserted, error: iErr } = await sb
        .from('order_items')
        .insert({
          order_id: order.id,
          product_id: p.productId,
          variant_id: p.variantId,
          quantity: p.quantity,
          size: p.size,
          secondary_size: p.secondarySize,
          buying_price_snapshot: Number(p.buyingSnapshot.toFixed(2)),
          selling_price_snapshot: Number(p.product.selling_price),
          unit_price_paid: p.unitPaid,
          discount_source_snapshot:
            (p.product.discount_percent ?? 0) > 0 ? (p.product.discount_source as DiscountSource) : null,
          fund_credit_snapshot: p.fundPerUnit,
          footspot_discount_pct: p.footspotPct,
          status: 'ok',
          flocking_name: p.flocking?.name?.trim() || null,
          flocking_initial: p.flocking?.initial?.trim() || null,
          flocking_number: p.flocking?.number?.trim() || null,
        })
        .select('id')
        .single()
      if (iErr) {
        await sb.from('orders').delete().eq('id', order.id)
        throw iErr
      }
      if (p.bundleComponents?.length) {
        const rows = p.bundleComponents.map((c) => ({
          order_item_id: inserted.id,
          component_product_id: c.component_product_id,
          component_variant_id: c.component_variant_id,
          axis: c.axis,
          quantity_per_unit: c.quantity_per_unit,
          unit_buying_price_snapshot: c.unit_buying_price_snapshot,
        }))
        const { error: cErr } = await sb.from('order_item_components').insert(rows)
        if (cErr) {
          await sb.from('orders').delete().eq('id', order.id)
          throw cErr
        }
      }
    }

    // * Fully-prepaid fast-path: run the same side effects the IPN normally
    // *   runs after a successful card payment. The order row was already
    // *   inserted with status='paid' + payment_method='prepaid'.
    if (isFullyPrepaid) {
      // * 1. Atomic promo claim (if any). On race-loss, we have to undo our
      // *    €0 marker and tell the customer to retry.
      const { data: claimRes } = await sb.rpc('claim_promo_for_order', { p_order_id: order.id })
      if (claimRes === false) {
        await sb.from('orders').update({
          status: 'cancelled',
          promo_code_id: null,
          promo_discount: 0,
        }).eq('id', order.id)
        return jsonResponse({ error: 'promo_race_lost' }, { status: 409 })
      }

      // * 2. Stock decrement + fund credit + low-stock notif.
      const { error: ppErr } = await sb.rpc('process_paid_order', { p_order_id: order.id })
      if (ppErr) {
        console.error('[create-order] process_paid_order (prepaid fast-path) failed', ppErr)
      }

      // * 3. Synthetic payment_events for audit trail.
      await sb.from('payment_events').insert({
        provider: 'prepaid',
        event_id: order.id,
        order_id: order.id,
        event_type: 'prepaid.consumed',
      })
    }

    return jsonResponse({
      ok: true,
      order: {
        id: order.id,
        access_token: order.access_token,
        number: order.order_number,
        total: order.total,
        status: isFullyPrepaid ? 'paid' : 'pending',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[create-order]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
