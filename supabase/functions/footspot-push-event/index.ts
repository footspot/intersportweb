// * footspot-push-event — builds + delivers one Footspot event.
// *
// * Called by the orders status trigger (pg_net) and by footspot-retry-worker.
// * Internal-only: caller must present the service role key in X-Internal-Call.
// *
// * The trigger passes { order_id, event_type } with a fresh idempotency key;
// * the retry worker re-passes the SAME idempotency key so the existing
// * footspot_event_log row is updated rather than duplicated.
// *
// * Backoff on failure: 5m → 15m → 1h → 4h → 24h, then give up + notify admin.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'
import { decryptApiToken } from '../_shared/footspot/cipher.ts'
import { postFootspot } from '../_shared/footspot/client.ts'

interface Payload {
  order_id: string
  event_type: 'order.created' | 'order.status_changed' | 'shipment.delivered' | 'order.refunded'
  idempotency_key?: string
}

// * Minutes until the next retry, indexed by the attempt that just failed.
const BACKOFF_MIN = [5, 15, 60, 240, 1440]

function backoffFor(attempts: number): string | null {
  // * attempts is the count AFTER the failure. attempts=1 → first retry in 5m.
  if (attempts >= BACKOFF_MIN.length) return null // * attempt 5 failed → give up
  const mins = BACKOFF_MIN[attempts - 1] ?? BACKOFF_MIN[BACKOFF_MIN.length - 1]
  return new Date(Date.now() + mins * 60_000).toISOString()
}

async function buildEnvelope(
  sb: ReturnType<typeof serviceClient>,
  order: Record<string, any>,
  footspotClubId: string,
  eventType: string,
): Promise<Record<string, unknown>> {
  const base = {
    id: `evt_${crypto.randomUUID()}`,
    type: eventType,
    version: 1,
    occurred_at: new Date().toISOString(),
    intersport_club_id: order.club_id,
    footspot_club_id: footspotClubId,
  }

  if (eventType === 'order.created') {
    // * Two-step fetch:
    // *   1. order_items + the row's product + (for non-packs) its variant.
    // *   2. order_item_components for every pack item, joined to component
    // *      product + component variant — keyed back to order_items by
    // *      order_item_id.
    // * We avoid one deeply-nested PostgREST select because relationship
    // * resolution becomes ambiguous when the same parent table (products,
    // * product_variants) is embedded twice via different FKs; the embed
    // * silently returns null for the inner relations and the items[] array
    // * ends up empty. Splitting also lets us log any select error rather
    // * than swallowing it via destructuring.
    // * Images live in product_images, not on products directly. Embed the
    // * gallery and pick the primary (lowest position) at mapping time.
    const { data: items, error: itemsErr } = await sb
      .from('order_items')
      .select('id, quantity, size, unit_price_paid, flocking_name, flocking_number, ' +
              'footspot_discount_pct, fund_credit_snapshot, buying_price_snapshot, ' +
              'product:products(id, reference, name, is_pack, footspot_category, ' +
                'images:product_images(image_path, position)' +
              '), ' +
              'variant:product_variants(footspot_size)')
      .eq('order_id', order.id)
    if (itemsErr) console.error('[footspot-push-event] order_items select', itemsErr)

    // * Pack items only — fetch their resolved components in one round trip
    // * keyed by the parent order_item_id.
    const packItemIds = (items ?? [])
      .filter((it: any) => !!it.product?.is_pack)
      .map((it: any) => it.id as string)
    const componentsByItem = new Map<string, any[]>()
    if (packItemIds.length > 0) {
      const { data: comps, error: compsErr } = await sb
        .from('order_item_components')
        .select('order_item_id, axis, quantity_per_unit, unit_buying_price_snapshot, ' +
                'component_product:products!order_item_components_component_product_id_fkey(' +
                  'id, reference, name, footspot_category, ' +
                  'images:product_images(image_path, position)' +
                '), ' +
                'component_variant:product_variants!order_item_components_component_variant_id_fkey(footspot_size)')
        .in('order_item_id', packItemIds)
      if (compsErr) console.error('[footspot-push-event] order_item_components select', compsErr)
      for (const c of comps ?? []) {
        const k = (c as any).order_item_id as string
        const list = componentsByItem.get(k) ?? []
        list.push(c)
        componentsByItem.set(k, list)
      }
    }

    // * Helper: pick the primary image_path from an embedded images array
    // * (product_images is ordered by `position`, 0 = primary).
    const primaryImage = (imgs: Array<{ image_path: string; position: number }> | null | undefined): string | null => {
      if (!imgs || imgs.length === 0) return null
      const sorted = [...imgs].sort((a, b) => a.position - b.position)
      return sorted[0]?.image_path ?? null
    }

    const mapped: Record<string, unknown>[] = []
    for (const it of items ?? []) {
      const p = (it as any).product
      const isPack = !!p?.is_pack
      const unitPaid = Number((it as any).unit_price_paid)
      const discountPct = Number((it as any).footspot_discount_pct ?? 0)
      // * unit_price_paid is already post-discount; the original is reversed
      // * from the locked discount %.
      const originalPrice = discountPct > 0 ? unitPaid / (1 - discountPct / 100) : unitPaid
      const clubMargin = Number((it as any).fund_credit_snapshot ?? 0)
      const intersportMargin = Number((it as any).buying_price_snapshot ?? 0)

      if (!isPack) {
        const footspotSize = (it as any).variant?.footspot_size ?? null
        // * Non-pack variants without a footspot_size are silently excluded.
        if (!footspotSize) continue
        mapped.push({
          product_id: p?.id,
          product_reference: p?.reference,
          product_name: p?.name?.fr ?? p?.name ?? '',
          footspot_category: p?.footspot_category ?? null,
          image_path: primaryImage(p?.images),
          is_pack: false,
          footspot_size: footspotSize,
          quantity: (it as any).quantity,
          flocking_name: (it as any).flocking_name ?? null,
          flocking_number: (it as any).flocking_number ?? null,
          unit_price_paid: unitPaid,
          original_price_cents: Math.round(originalPrice * 100),
          price_cents: Math.round(unitPaid * 100),
          discount_pct_applied: discountPct,
          club_margin_cents: Math.round(clubMargin * 100),
          intersport_margin_cents: Math.round(intersportMargin * 100),
          currency: 'EUR',
        })
        continue
      }

      // * Pack expansion. Drop components whose variant has no footspot_size
      // * mapping; if every component is unmapped, the whole pack disappears
      // * from the event (same rule as non-pack lines, applied per-component).
      const allComps = (componentsByItem.get((it as any).id) ?? []) as Array<{
        axis: 'primary' | 'secondary'
        quantity_per_unit: number
        unit_buying_price_snapshot: number
        component_product: {
          id: string
          reference: string
          name: { fr?: string } | string
          footspot_category: string | null
          images: Array<{ image_path: string; position: number }> | null
        } | null
        component_variant: { footspot_size: string | null } | null
      }>
      const comps = allComps.filter((c) => c.component_variant?.footspot_size)
      if (comps.length === 0) continue

      // * Allocate the pack's per-unit price / margin across kept components
      // * by weight = unit_buying_price_snapshot × quantity_per_unit. The
      // * rounding residual is absorbed by the primary axis so the cents
      // * sum matches the pack total exactly. We allocate in cents (then
      // * divide by quantity_per_unit) to avoid float drift.
      const weights = comps.map((c) => Number(c.unit_buying_price_snapshot) * Number(c.quantity_per_unit))
      const totalWeight = weights.reduce((a, b) => a + b, 0)
      // * Index of the primary component within `comps`; falls back to first
      // * kept component when all axes are secondary (shouldn't happen — the
      // * editor requires a primary — but stay defensive).
      const primaryIdx = Math.max(0, comps.findIndex((c) => c.axis === 'primary'))

      const splitCents = (totalCentsPerPack: number): number[] => {
        if (totalWeight <= 0) {
          // * Degenerate case: every component has 0 buying price. Split
          // * evenly, leftover to primary.
          const even = Math.floor(totalCentsPerPack / comps.length)
          const out = comps.map(() => even)
          out[primaryIdx] += totalCentsPerPack - even * comps.length
          return out
        }
        const out = weights.map((w) => Math.floor((totalCentsPerPack * w) / totalWeight))
        out[primaryIdx] += totalCentsPerPack - out.reduce((a, b) => a + b, 0)
        return out
      }

      const paidPerPack = splitCents(Math.round(unitPaid * 100))
      const originalPerPack = splitCents(Math.round(originalPrice * 100))
      const clubMarginPerPack = splitCents(Math.round(clubMargin * 100))
      const intersportMarginPerPack = splitCents(Math.round(intersportMargin * 100))

      const packQty = Number((it as any).quantity)
      for (let i = 0; i < comps.length; i++) {
        const c = comps[i]!
        const cp = c.component_product
        const cv = c.component_variant
        const qPerUnit = Number(c.quantity_per_unit)
        // * Footspot's `price_cents` is per unit of the line's `quantity`,
        // * so per-component-unit = per-pack-share / quantity_per_unit. Any
        // * sub-cent remainder here is absorbed by adding it back via the
        // * primary's already-rounded share (handled above at pack level);
        // * residual at the per-unit divide is negligible (≤ qPerUnit cents
        // * per pack) and consistent with how Footspot rounds elsewhere.
        const pricePerUnit = Math.round(paidPerPack[i]! / qPerUnit)
        const originalPerUnit = Math.round(originalPerPack[i]! / qPerUnit)
        const clubPerUnit = Math.round(clubMarginPerPack[i]! / qPerUnit)
        const intersportPerUnit = Math.round(intersportMarginPerPack[i]! / qPerUnit)
        const isPrimary = c.axis === 'primary'
        mapped.push({
          product_id: cp?.id,
          product_reference: cp?.reference,
          product_name: (cp?.name as any)?.fr ?? cp?.name ?? '',
          footspot_category: cp?.footspot_category ?? null,
          image_path: primaryImage(cp?.images),
          is_pack: false,
          footspot_size: cv?.footspot_size ?? null,
          quantity: packQty * qPerUnit,
          // * Flocking lives on the primary axis only (e.g. name+number on
          // * the jersey, not the shorts).
          flocking_name: isPrimary ? ((it as any).flocking_name ?? null) : null,
          flocking_number: isPrimary ? ((it as any).flocking_number ?? null) : null,
          unit_price_paid: pricePerUnit / 100,
          original_price_cents: originalPerUnit,
          price_cents: pricePerUnit,
          discount_pct_applied: discountPct,
          club_margin_cents: clubPerUnit,
          intersport_margin_cents: intersportPerUnit,
          currency: 'EUR',
          // * Lets Footspot show "part of <pack>" in its UI without changing
          // * the SKU model. Absent on non-pack items.
          from_pack: {
            product_id: p?.id,
            product_reference: p?.reference,
            product_name: p?.name?.fr ?? p?.name ?? '',
            axis: c.axis,
          },
        })
      }
    }

    const buyerName = [order.guest_first_name, order.guest_last_name].filter(Boolean).join(' ')
    return {
      ...base,
      data: {
        intersport_order_id: order.id,
        order_number: order.order_number,
        order_date: order.created_at,
        buyer_name: buyerName,
        buyer_email: order.guest_email ?? null,
        footspot_member_id: order.footspot_member_id ?? null,
        items: mapped,
      },
    }
  }

  if (eventType === 'order.status_changed') {
    return {
      ...base,
      data: {
        intersport_order_id: order.id,
        order_number: order.order_number,
        new_status: order.status,
        shipping_tracking: order.shipping_tracking ?? null,
      },
    }
  }

  if (eventType === 'shipment.delivered') {
    return {
      ...base,
      data: {
        intersport_order_id: order.id,
        order_number: order.order_number,
        delivered_at: order.delivered_at ?? new Date().toISOString(),
      },
    }
  }

  // * order.refunded
  return {
    ...base,
    data: {
      intersport_order_id: order.id,
      order_number: order.order_number,
      refund_total: Number(order.refund_total ?? 0),
      currency: 'EUR',
    },
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const internalKey = req.headers.get('X-Internal-Call')
  const serviceRole = serviceRoleKey()
  if (!internalKey || !serviceRole || internalKey !== serviceRole) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 })
  }

  const sb = serviceClient()

  let body: Payload
  try {
    body = (await req.json()) as Payload
  } catch {
    return jsonResponse({ error: 'invalid_json' }, { status: 400 })
  }
  if (!body.order_id || !body.event_type) {
    return jsonResponse({ error: 'order_id and event_type required' }, { status: 400 })
  }
  const idempotencyKey = body.idempotency_key ?? crypto.randomUUID()

  // * Load order + club + active footspot link.
  const { data: order, error: oErr } = await sb
    .from('orders')
    .select('*')
    .eq('id', body.order_id)
    .single()
  if (oErr || !order) return jsonResponse({ error: 'order_not_found' }, { status: 404 })

  const { data: link } = await sb
    .from('footspot_links')
    .select('footspot_club_id, api_token_encrypted, status')
    .eq('club_id', order.club_id)
    .maybeSingle()
  if (!link || link.status !== 'active') {
    // * Club not linked — nothing to dispatch. Not an error.
    return jsonResponse({ ok: true, skipped: 'club_not_linked' })
  }

  // * Find or create the log row keyed by idempotency_key.
  const { data: existingLog } = await sb
    .from('footspot_event_log')
    .select('id, attempts, status')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle()

  if (existingLog?.status === 'sent' || existingLog?.status === 'acknowledged') {
    return jsonResponse({ ok: true, idempotent: true })
  }

  const envelope = await buildEnvelope(sb, order, link.footspot_club_id, body.event_type)

  let logId = existingLog?.id ?? null
  if (!logId) {
    const { data: inserted, error: insErr } = await sb
      .from('footspot_event_log')
      .insert({
        idempotency_key: idempotencyKey,
        club_id: order.club_id,
        order_id: order.id,
        event_type: body.event_type,
        payload: envelope,
        status: 'pending',
      })
      .select('id')
      .single()
    if (insErr) {
      console.error('[footspot-push-event] log insert', insErr)
      return jsonResponse({ error: insErr.message }, { status: 500 })
    }
    logId = inserted.id
  }

  // * Deliver.
  let bearer: string
  try {
    bearer = await decryptApiToken(link.api_token_encrypted)
  } catch (e) {
    console.error('[footspot-push-event] decrypt', e)
    bearer = ''
  }

  const res = bearer
    ? await postFootspot({
        path: 'intersport-events',
        bearer,
        body: envelope,
        idempotencyKey,
      })
    : { ok: false, status: 500, json: { error: 'decrypt_failed' }, raw: '' }

  if (res.ok) {
    await sb
      .from('footspot_event_log')
      .update({ status: 'sent', last_error: null, next_retry_at: null })
      .eq('id', logId)
    return jsonResponse({ ok: true, delivered: true })
  }

  // * Failure path: bump attempts, schedule retry or give up.
  const attempts = (existingLog?.attempts ?? 0) + 1
  const nextRetry = backoffFor(attempts)
  const errMsg = `HTTP ${res.status}: ${(res.raw || JSON.stringify(res.json)).slice(0, 400)}`

  await sb
    .from('footspot_event_log')
    .update({
      status: 'failed',
      attempts,
      last_error: errMsg,
      next_retry_at: nextRetry,
    })
    .eq('id', logId)

  if (nextRetry === null) {
    // * Exhausted all retries — alert the back-office.
    await sb.rpc('notify_backoffice', {
      p_kind: 'footspot_event_failed',
      p_payload: {
        order_id: order.id,
        order_number: order.order_number,
        event_type: body.event_type,
        attempts,
        last_error: errMsg,
      },
    })
  }

  return jsonResponse({ ok: false, attempts, next_retry_at: nextRetry }, { status: 502 })
})
