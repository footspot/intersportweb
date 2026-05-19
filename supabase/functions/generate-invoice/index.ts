// * generate-invoice — renders a PDF invoice with pdf-lib, stores it in the
// * private 'invoices' bucket, saves the path on the order row, returns a
// * signed URL. Idempotent: subsequent calls reuse the existing file.
//
// * Access rules:
// *   - Back-office (admin / employee) can request any order.
// *   - Customer can request their own order only.
// *   - Other edge functions call it with X-Internal-Call = service-role key.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey, userClient } from '../_shared/supabase.ts'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

interface Payload {
  order_id: string
  locale?: 'fr' | 'en'
  regenerate?: boolean
}

function fmt(v: number | string, locale: 'fr' | 'en' = 'fr') {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(v ?? 0))
}

function fmtDate(iso: string | null, locale: 'fr' | 'en' = 'fr') {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// * Ensure a string only contains ASCII chars that the StandardFonts support.
function safe(s: string): string {
  return (s ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '')
}

async function renderInvoice(opts: {
  order: any
  items: any[]
  refunds: any[]
  locale: 'fr' | 'en'
}): Promise<Uint8Array> {
  const { order, items, refunds } = opts
  const loc = opts.locale
  const d = {
    fr: {
      title: 'Facture',
      orderNumber: 'Commande',
      date: 'Date',
      client: 'Client',
      shipTo: 'Adresse de livraison',
      items: 'Articles',
      size: 'Taille',
      qty: 'Qté',
      unit: 'P.U.',
      lineTotal: 'Total',
      subtotal: 'Sous-total',
      shipping: 'Livraison',
      refunds: 'Remboursements',
      total: 'TOTAL TTC',
      oosNote: 'Article remboursé (rupture de stock).',
      thanks: 'Merci pour votre achat.',
    },
    en: {
      title: 'Invoice',
      orderNumber: 'Order',
      date: 'Date',
      client: 'Customer',
      shipTo: 'Shipping address',
      items: 'Items',
      size: 'Size',
      qty: 'Qty',
      unit: 'U.P.',
      lineTotal: 'Total',
      subtotal: 'Subtotal',
      shipping: 'Shipping',
      refunds: 'Refunds',
      total: 'TOTAL',
      oosNote: 'Item refunded (out of stock).',
      thanks: 'Thank you for your order.',
    },
  }[loc]

  const pdf = await PDFDocument.create()
  let page = pdf.addPage([595.28, 841.89])  // * A4
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const MARGIN = 40
  const PRIMARY = rgb(0.012, 0.192, 0.976)    // * #0331f9
  const TEXT = rgb(0.1, 0.1, 0.1)
  const MUTED = rgb(0.4, 0.4, 0.4)
  const GREEN = rgb(0.063, 0.725, 0.506)

  let y = 841.89 - MARGIN

  // * Header
  page.drawText('Intersport Club IDF', { x: MARGIN, y, size: 18, font: bold, color: PRIMARY })
  y -= 22
  page.drawText(safe(d.title), { x: MARGIN, y, size: 14, font: bold, color: TEXT })
  page.drawText(`${d.orderNumber}: ${order.order_number}`, { x: 380, y: y + 20, size: 11, font, color: TEXT })
  page.drawText(`${d.date}: ${safe(fmtDate(order.paid_at ?? order.created_at, loc))}`, { x: 380, y: y + 4, size: 11, font, color: TEXT })

  y -= 30
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: 595.28 - MARGIN, y },
    thickness: 0.5,
    color: PRIMARY,
  })
  y -= 16

  // * Addresses
  const shipping = order.shipping_address ?? {}
  const fullName = safe(shipping.full_name ?? '')
  const addrLines = [
    shipping.line1,
    shipping.line2,
    `${shipping.postal_code ?? ''} ${shipping.city ?? ''}`.trim(),
    shipping.country,
  ]
    .filter(Boolean)
    .map(safe)

  page.drawText(safe(d.shipTo), { x: MARGIN, y, size: 9, font: bold, color: MUTED })
  y -= 14
  page.drawText(fullName, { x: MARGIN, y, size: 11, font: bold, color: TEXT })
  y -= 14
  for (const l of addrLines) {
    page.drawText(l, { x: MARGIN, y, size: 10, font, color: TEXT })
    y -= 13
  }

  y -= 16
  // * Items header
  page.drawRectangle({
    x: MARGIN - 4,
    y: y - 4,
    width: 595.28 - 2 * MARGIN + 8,
    height: 18,
    color: rgb(0.95, 0.95, 0.97),
  })
  page.drawText(safe(d.items), { x: MARGIN, y, size: 10, font: bold, color: TEXT })
  page.drawText(safe(d.qty), { x: 360, y, size: 10, font: bold, color: TEXT })
  page.drawText(safe(d.unit), { x: 420, y, size: 10, font: bold, color: TEXT })
  page.drawText(safe(d.lineTotal), { x: 490, y, size: 10, font: bold, color: TEXT })
  y -= 20

  for (const it of items) {
    if (y < 100) {
      page = pdf.addPage([595.28, 841.89])
      y = 841.89 - MARGIN
    }
    const name = safe(it.product?.name?.[loc] ?? it.product?.name?.fr ?? it.product?.reference ?? '?')
    const ref = safe(it.product?.reference ?? '')
    const lineTotal = Number(it.unit_price_paid) * it.quantity

    page.drawText(name, { x: MARGIN, y, size: 10, font: bold, color: TEXT })
    y -= 12
    const sub: string[] = [`${d.size} ${it.size}`, ref].filter(Boolean).map(safe)
    if (it.flocking_name) sub.push(`${it.flocking_name}`)
    if (it.flocking_initial) sub.push(it.flocking_initial)
    if (it.flocking_number) sub.push(`#${it.flocking_number}`)
    if (sub.length) {
      page.drawText(sub.join(' · '), { x: MARGIN, y, size: 9, font, color: MUTED })
    }
    if (it.status === 'refunded_oos') {
      y -= 11
      page.drawText(safe(d.oosNote), { x: MARGIN, y, size: 9, font, color: rgb(0.89, 0.043, 0.047) })
    }

    // * qty/unit/line on the same row as the name (so the headers align)
    const yRow = y + (it.status === 'refunded_oos' ? 23 : 12)
    page.drawText(String(it.quantity), { x: 365, y: yRow, size: 10, font, color: TEXT })
    page.drawText(safe(fmt(Number(it.unit_price_paid), loc)), { x: 420, y: yRow, size: 10, font, color: TEXT })
    page.drawText(safe(fmt(lineTotal, loc)), { x: 490, y: yRow, size: 10, font: bold, color: TEXT })

    y -= 14
  }

  if (y < 120) {
    page = pdf.addPage([595.28, 841.89])
    y = 841.89 - MARGIN
  }

  y -= 6
  page.drawLine({
    start: { x: 360, y },
    end: { x: 595.28 - MARGIN, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  })
  y -= 14

  const totalsRow = (label: string, value: string, isBold = false, color = TEXT) => {
    page.drawText(safe(label), { x: 360, y, size: 10, font: isBold ? bold : font, color })
    page.drawText(safe(value), { x: 490, y, size: 10, font: isBold ? bold : font, color })
    y -= 14
  }
  totalsRow(d.subtotal, fmt(order.subtotal, loc))
  totalsRow(d.shipping, fmt(order.shipping_cost, loc))
  if (Number(order.refund_total) > 0) {
    totalsRow(d.refunds, `-${fmt(order.refund_total, loc)}`, false, rgb(0.89, 0.043, 0.047))
  }
  y -= 2
  totalsRow(d.total, fmt(order.total, loc), true, PRIMARY)

  // * Refunds section
  if (refunds?.length) {
    y -= 12
    page.drawText(safe(d.refunds), { x: MARGIN, y, size: 10, font: bold, color: TEXT })
    y -= 14
    for (const r of refunds) {
      const line = `${safe(r.reason)} — ${safe(fmtDate(r.processed_at, loc))}: -${safe(fmt(r.amount, loc))}`
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: MUTED })
      y -= 11
    }
  }

  y -= 24
  page.drawText(safe(d.thanks), { x: MARGIN, y, size: 10, font, color: GREEN })

  return await pdf.save()
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const sb = serviceClient()

  // * Authorise: internal (service-role) OR back-office OR magic-link token.
  const internalKey = req.headers.get('X-Internal-Call')
  const serviceRole = serviceRoleKey()
  const isInternal = !!internalKey && !!serviceRole && internalKey === serviceRole

  let callerRole: string | null = null
  const accessToken = req.headers.get('X-Access-Token') ?? ''
  if (!isInternal && !accessToken) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing auth header' }, { status: 401 })
    const { data: userRes } = await userClient(authHeader).auth.getUser()
    if (!userRes?.user) return jsonResponse({ error: 'Invalid session' }, { status: 401 })
    const { data: profile } = await sb.from('profiles').select('role, active').eq('id', userRes.user.id).single()
    if (!profile || !profile.active) return jsonResponse({ error: 'Profile disabled' }, { status: 403 })
    if (profile.role !== 'admin' && profile.role !== 'employee') {
      return jsonResponse({ error: 'forbidden' }, { status: 403 })
    }
    callerRole = profile.role
  }

  try {
    const body = (await req.json()) as Payload
    if (!body?.order_id) return jsonResponse({ error: 'order_id required' }, { status: 400 })

    const { data: order, error: oErr } = await sb
      .from('orders')
      .select('*')
      .eq('id', body.order_id)
      .single()
    if (oErr || !order) return jsonResponse({ error: 'order not found' }, { status: 404 })

    // * Magic-link path: the buyer presents the order's access_token to fetch
    // * their own invoice without a session. Back-office + service-role calls
    // * skipped this branch above.
    if (!isInternal && !callerRole) {
      if (!accessToken || accessToken !== order.access_token) {
        return jsonResponse({ error: 'forbidden' }, { status: 403 })
      }
    }

    // * Idempotent: return the existing signed URL unless regenerate is true
    if (order.invoice_path && !body.regenerate) {
      const { data: signed, error: sErr } = await sb.storage
        .from('invoices')
        .createSignedUrl(order.invoice_path, 60 * 60 * 24)
      if (!sErr && signed?.signedUrl) {
        return jsonResponse({ ok: true, signed_url: signed.signedUrl, invoice_path: order.invoice_path, cached: true })
      }
      // * fall through and regenerate if signing failed
    }

    const { data: items } = await sb
      .from('order_items')
      .select('*, product:products(name, reference)')
      .eq('order_id', order.id)
    const { data: refunds } = await sb
      .from('refunds')
      .select('*')
      .eq('order_id', order.id)
      .order('processed_at', { ascending: false })

    const locale = body.locale ?? 'fr'
    const pdfBytes = await renderInvoice({ order, items: items ?? [], refunds: refunds ?? [], locale })

    const path = `${new Date().getFullYear()}/${order.order_number}.pdf`
    const { error: upErr } = await sb.storage
      .from('invoices')
      .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (upErr) throw upErr

    await sb.from('orders').update({ invoice_path: path }).eq('id', order.id)

    const { data: signed, error: sErr } = await sb.storage
      .from('invoices')
      .createSignedUrl(path, 60 * 60 * 24)
    if (sErr) throw sErr

    return jsonResponse({ ok: true, signed_url: signed.signedUrl, invoice_path: path })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate-invoice]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
