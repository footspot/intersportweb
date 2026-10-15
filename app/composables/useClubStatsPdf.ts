// * Client-side PDF generator for the /admin/stats dashboard — a per-club
// * statistics report that can be sent to a club that asks for its figures
// * on file.
// *
// *   Page 1  – logos, title, meta block (period / range / filters / generated),
// *             6 KPI cards, revenue + cagnotte bar chart
// *   Then    – best sellers, CA par sport, ventes par taille, as paginated
// *             tables with totals
// *
// * The numbers are NOT recomputed here: the caller passes exactly what
// * admin-stats already returned for the filters on screen, so the PDF and the
// * dashboard can never disagree. The flip side is that the report inherits the
// * active filters, which is why they are printed in the meta block — a report
// * silently narrowed to one size or category would be misleading.
// *
// * jsPDF doesn't render SVG directly; loadImage() rasterises via canvas first,
// * so /logo_horizontal.svg and the Supabase club-logo PNGs both work.

import { jsPDF } from 'jspdf'
import { loadImage } from '~/composables/useQrCode'
import {
  BRAND, GREEN, MUTED, RULE,
  CONTENT_W, MARGIN, PAGE_W,
  type PdfCtx, type TableCol,
  drawDocHeader, drawMetaBlock, drawStatCards, drawTable,
  downloadPdfBlob, ensureSpace, fmtInt, fmtMoney, sectionTitle, stampFooters,
} from '~/composables/usePdfDoc'

export interface ClubStatsPdfKpis {
  revenue: number
  margin: number
  orders: number
  average_basket: number
  active_products: number
  total_fund: number
}

export interface ClubStatsPdfInput {
  intersportLogoUrl: string
  clubLogoUrl: string | null
  // * null = the report covers every club (no club filter was set).
  clubName: string | null
  periodLabel: string
  // * Explicit bounds, shown under the period label. Null for preset periods
  // * where the label already says it ("7 derniers jours").
  rangeLabel: string | null
  generatedAtLabel: string
  // * Secondary filters that were active (category / product / size / ref),
  // * already formatted by the caller. Printed so the scope is never implicit.
  activeFiltersLabel: string | null
  kpis: ClubStatsPdfKpis
  revenueSeries: Array<{ bucket: string; revenue: number; margin: number }>
  revenueBySport: Array<{ label: string; value: number }>
  sizeBreakdown: Array<{ size: string | null; qty: number }>
  bestSellers: Array<{
    name: string
    reference: string
    clubName: string | null
    qty: number
    revenue: number
    margin: number
  }>
  i18n: {
    title: string
    allClubs: string
    period: string
    range: string
    filters: string
    generatedAt: string
    kpiRevenue: string
    kpiMargin: string
    kpiOrders: string
    kpiAverageBasket: string
    kpiActiveProducts: string
    kpiTotalFund: string
    chartTitle: string
    legendRevenue: string
    legendMargin: string
    bestSellers: string
    colProduct: string
    colReference: string
    colClub: string
    colQty: string
    colRevenue: string
    colMargin: string
    sportTitle: string
    colSport: string
    sizeTitle: string
    colSize: string
    uniqueSize: string
    total: string
    noData: string
    page: string
    confidential: string
  }
}

// * Grouped bar chart: revenue and cagnotte side by side per bucket. Drawn with
// * plain rects because the dashboard's own chart is HTML/CSS (and the donut is
// * SVG), so there is no canvas to lift a bitmap from.
function drawRevenueChart(ctx: PdfCtx, input: ClubStatsPdfInput) {
  const series = input.revenueSeries
  sectionTitle(ctx, input.i18n.chartTitle)

  if (series.length === 0) {
    ctx.doc.setFont('helvetica', 'italic')
    ctx.doc.setFontSize(9)
    ctx.doc.setTextColor(...MUTED)
    ctx.doc.text(input.i18n.noData, MARGIN, ctx.y + 4)
    ctx.y += 12
    return
  }

  const CHART_H = 42
  ensureSpace(ctx, CHART_H + 16)
  const { doc } = ctx
  const baseY = ctx.y + CHART_H
  const max = Math.max(...series.map((s) => Math.max(s.revenue, s.margin)), 1)

  // * Legend above the plot.
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setFillColor(...BRAND)
  doc.rect(MARGIN, ctx.y - 3.4, 3, 3, 'F')
  doc.setTextColor(...MUTED)
  doc.text(input.i18n.legendRevenue, MARGIN + 4.5, ctx.y - 1)
  const legend2X = MARGIN + 4.5 + doc.getTextWidth(input.i18n.legendRevenue) + 6
  doc.setFillColor(...GREEN)
  doc.rect(legend2X, ctx.y - 3.4, 3, 3, 'F')
  doc.text(input.i18n.legendMargin, legend2X + 4.5, ctx.y - 1)

  // * Baseline + max gridline, with the max labelled so bars are readable
  // * without axis ticks.
  doc.setDrawColor(...RULE)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, baseY, PAGE_W - MARGIN, baseY)
  doc.line(MARGIN, ctx.y, PAGE_W - MARGIN, ctx.y)
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text(fmtMoney(max), PAGE_W - MARGIN, ctx.y - 1, { align: 'right' })

  const slot = CONTENT_W / series.length
  const barW = Math.min(4, Math.max(0.8, slot / 3))
  // * With many buckets, label only every nth so the axis stays legible.
  const labelEvery = Math.ceil(series.length / 12)

  series.forEach((s, i) => {
    const cx = MARGIN + slot * i + slot / 2
    const rh = (s.revenue / max) * CHART_H
    const mh = (s.margin / max) * CHART_H
    doc.setFillColor(...BRAND)
    doc.rect(cx - barW - 0.3, baseY - rh, barW, rh, 'F')
    doc.setFillColor(...GREEN)
    doc.rect(cx + 0.3, baseY - mh, barW, mh, 'F')
    if (i % labelEvery === 0) {
      doc.setFontSize(6.5)
      doc.setTextColor(140, 140, 140)
      doc.text(s.bucket, cx, baseY + 3.5, { align: 'center' })
    }
  })

  ctx.y = baseY + 10
}

export async function buildClubStatsPdf(input: ClubStatsPdfInput): Promise<Blob> {
  const [intersportLogo, clubLogo] = await Promise.all([
    loadImage(input.intersportLogoUrl),
    input.clubLogoUrl ? loadImage(input.clubLogoUrl) : Promise.resolve(null),
  ])

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const ctx: PdfCtx = { doc, y: MARGIN }

  drawDocHeader(ctx, {
    leftLogo: intersportLogo,
    rightLogo: clubLogo,
    title: input.i18n.title,
    subtitle: input.clubName ?? input.i18n.allClubs,
  })

  const meta: Array<[string, string]> = [[input.i18n.period, input.periodLabel]]
  if (input.rangeLabel) meta.push([input.i18n.range, input.rangeLabel])
  if (input.activeFiltersLabel) meta.push([input.i18n.filters, input.activeFiltersLabel])
  meta.push([input.i18n.generatedAt, input.generatedAtLabel])
  drawMetaBlock(ctx, meta)

  drawStatCards(ctx, [
    { label: input.i18n.kpiRevenue, value: fmtMoney(input.kpis.revenue) },
    { label: input.i18n.kpiMargin, value: fmtMoney(input.kpis.margin), accent: GREEN },
    { label: input.i18n.kpiOrders, value: fmtInt(input.kpis.orders) },
    { label: input.i18n.kpiAverageBasket, value: fmtMoney(input.kpis.average_basket) },
    { label: input.i18n.kpiActiveProducts, value: fmtInt(input.kpis.active_products) },
    { label: input.i18n.kpiTotalFund, value: fmtMoney(input.kpis.total_fund), accent: GREEN },
  ])

  drawRevenueChart(ctx, input)

  // ── Best sellers ──────────────────────────────────────────────────────────
  sectionTitle(ctx, input.i18n.bestSellers)
  // * The club column only earns its space when the report spans several clubs.
  const withClub = !input.clubName
  const bsCols: TableCol[] = withClub
    ? [
        { label: input.i18n.colProduct, width: 54 },
        { label: input.i18n.colReference, width: 26 },
        { label: input.i18n.colClub, width: 32 },
        { label: input.i18n.colQty, width: 16, align: 'right' },
        { label: input.i18n.colRevenue, width: 23, align: 'right' },
        { label: input.i18n.colMargin, width: 23, align: 'right' },
      ]
    : [
        { label: input.i18n.colProduct, width: 76 },
        { label: input.i18n.colReference, width: 32 },
        { label: input.i18n.colQty, width: 20, align: 'right' },
        { label: input.i18n.colRevenue, width: 23, align: 'right' },
        { label: input.i18n.colMargin, width: 23, align: 'right' },
      ]

  const bsRows = input.bestSellers.map((b) =>
    withClub
      ? [b.name, b.reference, b.clubName ?? '—', fmtInt(b.qty), fmtMoney(b.revenue), fmtMoney(b.margin)]
      : [b.name, b.reference, fmtInt(b.qty), fmtMoney(b.revenue), fmtMoney(b.margin)],
  )
  const bsTotals = input.bestSellers.reduce(
    (a, b) => ({ qty: a.qty + b.qty, revenue: a.revenue + b.revenue, margin: a.margin + b.margin }),
    { qty: 0, revenue: 0, margin: 0 },
  )
  drawTable(ctx, bsCols, bsRows, {
    noData: input.i18n.noData,
    totalRow: bsRows.length
      ? withClub
        ? [input.i18n.total, '', '', fmtInt(bsTotals.qty), fmtMoney(bsTotals.revenue), fmtMoney(bsTotals.margin)]
        : [input.i18n.total, '', fmtInt(bsTotals.qty), fmtMoney(bsTotals.revenue), fmtMoney(bsTotals.margin)]
      : undefined,
  })

  // ── CA par sport ──────────────────────────────────────────────────────────
  sectionTitle(ctx, input.i18n.sportTitle)
  const sportTotal = input.revenueBySport.reduce((a, s) => a + s.value, 0)
  drawTable(
    ctx,
    [
      { label: input.i18n.colSport, width: 124 },
      { label: input.i18n.colRevenue, width: 50, align: 'right' },
    ],
    input.revenueBySport.map((s) => [s.label, fmtMoney(s.value)]),
    {
      noData: input.i18n.noData,
      totalRow: input.revenueBySport.length ? [input.i18n.total, fmtMoney(sportTotal)] : undefined,
    },
  )

  // ── Ventes par taille ─────────────────────────────────────────────────────
  sectionTitle(ctx, input.i18n.sizeTitle)
  const sizeTotal = input.sizeBreakdown.reduce((a, s) => a + s.qty, 0)
  drawTable(
    ctx,
    [
      { label: input.i18n.colSize, width: 124 },
      { label: input.i18n.colQty, width: 50, align: 'right' },
    ],
    input.sizeBreakdown.map((s) => [s.size ?? input.i18n.uniqueSize, fmtInt(s.qty)]),
    {
      noData: input.i18n.noData,
      totalRow: input.sizeBreakdown.length ? [input.i18n.total, fmtInt(sizeTotal)] : undefined,
    },
  )

  stampFooters(doc, { confidential: input.i18n.confidential, pageLabel: input.i18n.page })
  return doc.output('blob')
}

export const downloadClubStatsPdf = downloadPdfBlob
