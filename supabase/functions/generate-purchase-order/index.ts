// * generate-purchase-order — renders an internal "Bon de commande" PDF with
// * pdf-lib, mirroring the admin order drawer: items with bundle component
// * sizes, flocking + paid options, buying price + fund credited, totals with
// * total weight, and the delivery method + address. Stored in the private
// * 'invoices' bucket under purchase-orders/, returns a signed URL.
// *
// * Back-office (admin / employee) only — this document is never customer-facing,
// * so it is regenerated on every call (no idempotency column on the order).
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyBackoffice } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { drawLogo, LOGO_ASPECT } from '../_shared/pdf-logo.ts'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

interface Payload {
  order_id: string
  locale?: 'fr' | 'en'
}

function fmt(v: number | string, locale: 'fr' | 'en' = 'fr') {
  // * StandardFonts can't draw '€' (stripped by safe()), so spell out EUR.
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(v ?? 0)).replace('€', 'EUR')
}

function fmtDate(iso: string | null, locale: 'fr' | 'en' = 'fr') {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// * Ensure a string only contains ASCII chars that the StandardFonts support.
function safe(s: string): string {
  return (s ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
}

export async function renderPurchaseOrder(opts: {
  order: any
  items: any[]
  locale: 'fr' | 'en'
}): Promise<Uint8Array> {
  const { order, items } = opts
  const loc = opts.locale
  const d = {
    fr: {
      title: 'Bon de commande',
      orderNumber: 'Commande',
      date: 'Date',
      client: 'Client',
      club: 'Club',
      items: 'Articles',
      size: 'Taille',
      qty: 'Qte',
      ref: 'Ref',
      flocking: 'Flocage',
      options: 'Options',
      buying: 'Prix achat',
      fund: 'Cagnotte creditee',
      oosNote: 'Article rembourse (rupture de stock).',
      subtotal: 'Sous-total',
      shipping: 'Livraison',
      totalWeight: 'Poids total',
      total: 'TOTAL',
      delivery: 'Livraison',
      deliveryMode: 'Mode',
      deliveryAddress: 'Adresse',
      tracking: 'Suivi',
      method: {
        colissimo: 'Livraison a domicile (Colissimo)',
        club_pickup: 'Retrait au club',
        shop_pickup: 'Retrait en magasin Intersport',
      } as Record<string, string>,
      internal: 'Document interne — ne pas remettre au client.',
    },
    en: {
      title: 'Purchase order',
      orderNumber: 'Order',
      date: 'Date',
      client: 'Customer',
      club: 'Club',
      items: 'Items',
      size: 'Size',
      qty: 'Qty',
      ref: 'Ref',
      flocking: 'Flocking',
      options: 'Options',
      buying: 'Buying price',
      fund: 'Fund credited',
      oosNote: 'Item refunded (out of stock).',
      subtotal: 'Subtotal',
      shipping: 'Shipping',
      totalWeight: 'Total weight',
      total: 'TOTAL',
      delivery: 'Delivery',
      deliveryMode: 'Method',
      deliveryAddress: 'Address',
      tracking: 'Tracking',
      method: {
        colissimo: 'Home delivery (Colissimo)',
        club_pickup: 'Club pickup',
        shop_pickup: 'Intersport shop pickup',
      } as Record<string, string>,
      internal: 'Internal document — do not hand to the customer.',
    },
  }[loc]

  const pdf = await PDFDocument.create()
  let page = pdf.addPage([595.28, 841.89]) // * A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const MARGIN = 40
  const PRIMARY = rgb(0.012, 0.192, 0.976) // * #0331f9
  const TEXT = rgb(0.1, 0.1, 0.1)
  const MUTED = rgb(0.4, 0.4, 0.4)
  const GREEN = rgb(0.063, 0.725, 0.506)
  const RED = rgb(0.89, 0.043, 0.047)

  let y = 841.89 - MARGIN

  const ensureRoom = (needed = 100) => {
    if (y < needed) {
      page = pdf.addPage([595.28, 841.89])
      y = 841.89 - MARGIN
    }
  }

  // * Header — official Intersport logo instead of a text wordmark.
  const LOGO_WIDTH = 150
  drawLogo(page, { x: MARGIN, yTop: y + 13, width: LOGO_WIDTH })
  y -= 14 + LOGO_WIDTH * LOGO_ASPECT
  page.drawText(safe(d.title), { x: MARGIN, y, size: 14, font: bold, color: TEXT })
  page.drawText(`${d.orderNumber}: ${order.order_number}`, { x: 360, y: y + 20, size: 11, font, color: TEXT })
  page.drawText(`${d.date}: ${safe(fmtDate(order.created_at, loc))}`, { x: 360, y: y + 4, size: 10, font, color: TEXT })

  y -= 30
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: 595.28 - MARGIN, y },
    thickness: 0.5,
    color: PRIMARY,
  })
  y -= 18

  // * Client + club (two columns, like the drawer)
  const clientName = safe(
    [order.guest_first_name, order.guest_last_name].filter(Boolean).join(' ') ||
      order.shipping_address?.full_name || '—',
  )
  page.drawText(safe(d.client), { x: MARGIN, y, size: 9, font: bold, color: MUTED })
  page.drawText(safe(d.club), { x: 320, y, size: 9, font: bold, color: MUTED })
  y -= 14
  page.drawText(clientName, { x: MARGIN, y, size: 11, font: bold, color: TEXT })
  page.drawText(safe(order.club?.name ?? '—'), { x: 320, y, size: 11, font: bold, color: TEXT })
  y -= 13
  page.drawText(safe(order.guest_email ?? ''), { x: MARGIN, y, size: 9, font, color: MUTED })
  y -= 22

  // * Items header
  page.drawRectangle({
    x: MARGIN - 4,
    y: y - 4,
    width: 595.28 - 2 * MARGIN + 8,
    height: 18,
    color: rgb(0.95, 0.95, 0.97),
  })
  page.drawText(safe(d.items), { x: MARGIN, y, size: 10, font: bold, color: TEXT })
  page.drawText(safe(d.qty), { x: 420, y, size: 10, font: bold, color: TEXT })
  page.drawText('Total', { x: 490, y, size: 10, font: bold, color: TEXT })
  y -= 20

  for (const it of items) {
    ensureRoom(140)
    const name = safe(it.product?.name?.[loc] ?? it.product?.name?.fr ?? it.product?.reference ?? '?')
    const lineTotal = Number(it.unit_price_paid) * it.quantity

    page.drawText(name, { x: MARGIN, y, size: 10, font: bold, color: TEXT })
    page.drawText(String(it.quantity), { x: 425, y, size: 10, font, color: TEXT })
    page.drawText(safe(fmt(lineTotal, loc)), { x: 490, y, size: 10, font: bold, color: TEXT })
    y -= 12

    // * Size / color / reference sub-line
    const sub: string[] = []
    if (it.color) sub.push(safe(it.color))
    sub.push(`${d.size} ${safe(it.size ?? '—')}${it.secondary_size ? ` / ${safe(it.secondary_size)}` : ''}`)
    if (it.product?.reference) sub.push(`${d.ref} ${safe(it.product.reference)}`)
    page.drawText(sub.join(' - '), { x: MARGIN + 8, y, size: 9, font, color: MUTED })
    y -= 11

    // * Bundle component breakdown — one "PRODUCT : SIZE" line per component.
    for (const c of it.components ?? []) {
      const cName = c.product?.name?.[loc] ?? c.product?.name?.fr
      if (!cName) continue
      const cSize = c.variant?.size ?? (c.axis === 'secondary' ? it.secondary_size : it.size) ?? '—'
      ensureRoom(120)
      page.drawText(`${safe(cName)} : ${safe(String(cSize))}`, { x: MARGIN + 8, y, size: 9, font, color: MUTED })
      y -= 11
    }

    // * Flocking / personalisation — must always appear on the picking doc.
    const flock: string[] = []
    if (it.flocking_name) flock.push(safe(it.flocking_name))
    if (it.flocking_initial) flock.push(safe(it.flocking_initial))
    if (it.flocking_number) flock.push(`#${safe(String(it.flocking_number))}`)
    if (flock.length) {
      ensureRoom(120)
      page.drawText(`${d.flocking}: ${flock.join(' - ')}`, { x: MARGIN + 8, y, size: 9, font: bold, color: PRIMARY })
      y -= 11
    }

    // * Paid custom options snapshot (e.g. engraving text).
    if (Array.isArray(it.selected_options) && it.selected_options.length) {
      const opts = it.selected_options
        .map((o: any) => safe(o.value ? `${o.name} : ${o.value}` : o.name))
        .join(', ')
      ensureRoom(120)
      page.drawText(`${d.options}: ${opts}`, { x: MARGIN + 8, y, size: 9, font: bold, color: PRIMARY })
      y -= 11
    }

    // * Buying price + fund credited (internal figures).
    ensureRoom(120)
    page.drawText(
      `${d.buying}: ${safe(fmt(it.buying_price_snapshot, loc))} - ${d.fund}: ${safe(fmt(Number(it.fund_credit_snapshot) * it.quantity, loc))}`,
      { x: MARGIN + 8, y, size: 9, font, color: GREEN },
    )
    y -= 11

    if (it.status === 'refunded_oos') {
      page.drawText(safe(d.oosNote), { x: MARGIN + 8, y, size: 9, font, color: RED })
      y -= 11
    }

    y -= 6
  }

  ensureRoom(180)

  // * Totals
  y -= 4
  page.drawLine({
    start: { x: 360, y },
    end: { x: 595.28 - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  })
  y -= 14

  const totalWeightGrams = items.reduce(
    (sum, it) => sum + Number(it.product?.weight_grams ?? 0) * it.quantity,
    0,
  )
  const weightLabel = totalWeightGrams >= 1000
    ? `${(totalWeightGrams / 1000).toFixed(2)} kg`
    : `${totalWeightGrams} g`

  const totalsRow = (label: string, value: string, isBold = false, color = TEXT) => {
    page.drawText(safe(label), { x: 360, y, size: 10, font: isBold ? bold : font, color })
    page.drawText(safe(value), { x: 490, y, size: 10, font: isBold ? bold : font, color })
    y -= 14
  }
  totalsRow(d.subtotal, fmt(order.subtotal, loc))
  totalsRow(d.shipping, fmt(order.shipping_cost, loc))
  totalsRow(d.totalWeight, weightLabel, false, PRIMARY)
  if (Number(order.refund_total) > 0) {
    totalsRow(`- ${d.subtotal}`, `-${fmt(order.refund_total, loc)}`, false, RED)
  }
  y -= 2
  totalsRow(d.total, fmt(order.total, loc), true, PRIMARY)

  // * Delivery method + address
  ensureRoom(140)
  y -= 10
  page.drawText(safe(d.delivery), { x: MARGIN, y, size: 11, font: bold, color: TEXT })
  y -= 14
  page.drawText(
    `${d.deliveryMode}: ${safe(d.method[order.delivery_method] ?? order.delivery_method ?? '—')}`,
    { x: MARGIN, y, size: 10, font: bold, color: PRIMARY },
  )
  y -= 14

  const addrLines: string[] = []
  if (order.delivery_method === 'colissimo') {
    const a = order.shipping_address ?? {}
    for (const l of [a.full_name, a.line1, a.line2, `${a.postal_code ?? ''} ${a.city ?? ''}`.trim(), a.country, a.phone]) {
      if (l) addrLines.push(safe(String(l)))
    }
  } else if (order.delivery_method === 'shop_pickup' && order.shop) {
    const s = order.shop
    for (const l of [s.name, s.address, `${s.postal_code ?? ''} ${s.city ?? ''}`.trim(), s.phone]) {
      if (l) addrLines.push(safe(String(l)))
    }
  } else {
    // * club_pickup — the club itself is the pickup point.
    if (order.club?.name) addrLines.push(safe(order.club.name))
  }
  if (addrLines.length) {
    page.drawText(`${safe(d.deliveryAddress)}:`, { x: MARGIN, y, size: 9, font: bold, color: MUTED })
    y -= 13
    for (const l of addrLines) {
      ensureRoom(80)
      page.drawText(l, { x: MARGIN + 8, y, size: 10, font, color: TEXT })
      y -= 13
    }
  }
  if (order.shipping_tracking) {
    ensureRoom(80)
    page.drawText(`${d.tracking}: ${safe(order.shipping_tracking)}`, { x: MARGIN, y, size: 9, font, color: MUTED })
    y -= 13
  }

  y -= 16
  ensureRoom(60)
  page.drawText(safe(d.internal), { x: MARGIN, y, size: 9, font, color: MUTED })

  return await pdf.save()
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const guard = await verifyBackoffice(req)
  if (guard instanceof Response) return guard

  const sb = serviceClient()

  try {
    const body = (await req.json()) as Payload
    if (!body?.order_id) return jsonResponse({ error: 'order_id required' }, { status: 400 })

    const { data: order, error: oErr } = await sb
      .from('orders')
      .select('*, club:clubs(name), shop:intersport_shops(name, address, postal_code, city, phone)')
      .eq('id', body.order_id)
      .single()
    if (oErr || !order) return jsonResponse({ error: 'order not found' }, { status: 404 })

    const { data: items, error: iErr } = await sb
      .from('order_items')
      .select(
        '*, product:products(name, reference, weight_grams),' +
          'components:order_item_components(axis, product:products(name), variant:product_variants(size))',
      )
      .eq('order_id', order.id)
    if (iErr) throw iErr

    const locale = body.locale ?? 'fr'
    const pdfBytes = await renderPurchaseOrder({ order, items: items ?? [], locale })

    const path = `purchase-orders/${new Date().getFullYear()}/${order.order_number}.pdf`
    const { error: upErr } = await sb.storage
      .from('invoices')
      .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw upErr

    const { data: signed, error: sErr } = await sb.storage
      .from('invoices')
      .createSignedUrl(path, 60 * 60 * 24)
    if (sErr) throw sErr

    return jsonResponse({ ok: true, signed_url: signed.signedUrl, path })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate-purchase-order]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
