// * Shared drawing primitives for the admin's client-side PDF reports
// * (useClubStatsPdf, usePromoUsagePdf). A4 portrait in mm, jsPDF standard
// * fonts, Intersport palette.
// *
// * usePromoBatchPdf predates this module and keeps its own helpers: it lays out
// * a cuttable voucher grid rather than a report, so it shares almost nothing
// * beyond the page size. It is left alone deliberately — it works, and folding
// * it in here would be churn for no gain.

import type { jsPDF } from 'jspdf'
import type { LoadedImage } from '~/composables/useQrCode'

// * A4 portrait, mm units.
export const PAGE_W = 210
export const PAGE_H = 297
export const MARGIN = 18
export const CONTENT_W = PAGE_W - MARGIN * 2

// * Space kept clear at the bottom for the footer rule + line.
export const FOOTER_H = 16

export type Rgb = [number, number, number]

// ! Build these through a helper, never as `export const X = [r, g, b]`. Nuxt's
// ! auto-import scanner reads that form as an array DESTRUCTURING export and
// ! registers the array's ELEMENTS as importable names — which silently emitted
// ! `import { 250 } from 'usePdfDoc'` into an unrelated composable and failed the
// ! build with a sourcemapped error pointing at the wrong file entirely.
function rgb(r: number, g: number, b: number): Rgb {
  return [r, g, b]
}

export const BRAND = rgb(3, 49, 249)      // * #0331f9
export const SECONDARY = rgb(227, 11, 12) // * #e30b0c
export const GREEN = rgb(22, 163, 74)
export const INK = rgb(20, 20, 20)
export const MUTED = rgb(110, 110, 110)
export const RULE = rgb(220, 220, 220)
export const ZEBRA = rgb(246, 247, 250)

// ! jsPDF's standard fonts are WinAnsi-encoded. Intl's fr-FR group separator is
// ! U+202F (narrow no-break space) and its currency gap can be U+00A0, neither of
// ! which exists in WinAnsi — they render as blank boxes as soon as a number
// ! reaches four digits. Normalise both to a plain space.
function winAnsiSafe(s: string): string {
  return s.replace(/[  ]/g, ' ')
}

export function fmtMoney(v: number): string {
  return winAnsiSafe(
    new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
      .format(Number.isFinite(v) ? v : 0),
  )
}

export function fmtInt(v: number): string {
  return winAnsiSafe(new Intl.NumberFormat('fr-FR').format(Number.isFinite(v) ? v : 0))
}

// * Cursor carried through the drawing helpers.
export interface PdfCtx {
  doc: jsPDF
  y: number
}

export function newPage(ctx: PdfCtx) {
  ctx.doc.addPage('a4', 'portrait')
  ctx.y = MARGIN
}

export function ensureSpace(ctx: PdfCtx, needed: number) {
  if (ctx.y + needed > PAGE_H - FOOTER_H) newPage(ctx)
}

// * Fit an image inside a box without distorting it.
export function drawImageFit(
  doc: jsPDF,
  img: LoadedImage | null,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  anchor: 'left' | 'right',
): number {
  if (!img) return 0
  const scale = Math.min(boxW / img.width, boxH / img.height)
  const w = img.width * scale
  const h = img.height * scale
  doc.addImage(img.dataUrl, 'PNG', anchor === 'left' ? x : x - w, y, w, h, undefined, 'FAST')
  return h
}

export function sectionTitle(ctx: PdfCtx, label: string) {
  ensureSpace(ctx, 14)
  const { doc } = ctx
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...INK)
  doc.text(label, MARGIN, ctx.y)
  ctx.y += 2
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.6)
  doc.line(MARGIN, ctx.y, MARGIN + 16, ctx.y)
  ctx.y += 5
}

// * Logo band + title + coloured subtitle. Returns with the cursor below it.
export function drawDocHeader(
  ctx: PdfCtx,
  opts: {
    leftLogo: LoadedImage | null
    rightLogo: LoadedImage | null
    title: string
    subtitle: string
    leftLogoW?: number
    rightLogoMax?: number
  },
) {
  const { doc } = ctx
  const leftW = opts.leftLogoW ?? 58
  const rightMax = opts.rightLogoMax ?? 22
  const logoH = drawImageFit(doc, opts.leftLogo, MARGIN, MARGIN, leftW, 16, 'left')
  drawImageFit(doc, opts.rightLogo, PAGE_W - MARGIN, MARGIN, rightMax, rightMax, 'right')

  ctx.y = MARGIN + Math.max(logoH, opts.rightLogo ? rightMax : 0) + 10

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(...INK)
  doc.text(opts.title, MARGIN, ctx.y)
  ctx.y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...BRAND)
  doc.text(opts.subtitle, MARGIN, ctx.y)
  ctx.y += 8
}

// * Key/value box — the report's scope, printed so it is never implicit.
export function drawMetaBlock(ctx: PdfCtx, rows: Array<[string, string]>, labelW = 40) {
  if (rows.length === 0) return
  const { doc } = ctx
  const boxH = rows.length * 5 + 4
  ensureSpace(ctx, boxH + 4)
  doc.setFillColor(250, 250, 252)
  doc.setDrawColor(...RULE)
  doc.setLineWidth(0.2)
  doc.rect(MARGIN, ctx.y, CONTENT_W, boxH, 'FD')
  let my = ctx.y + 5.5
  for (const [k, v] of rows) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(`${k} :`, MARGIN + 3, my)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...INK)
    doc.text(doc.splitTextToSize(v, CONTENT_W - labelW - 6)[0] ?? v, MARGIN + labelW, my)
    my += 5
  }
  ctx.y += boxH + 8
}

// * Stat cards in a grid. `accent` tints the value.
export function drawStatCards(
  ctx: PdfCtx,
  cards: Array<{ label: string; value: string; accent?: Rgb }>,
  cols = 3,
) {
  const GAP = 4
  const CARD_W = (CONTENT_W - GAP * (cols - 1)) / cols
  const CARD_H = 18
  const rows = Math.ceil(cards.length / cols)
  ensureSpace(ctx, rows * (CARD_H + GAP))

  const { doc } = ctx
  cards.forEach((c, i) => {
    const x = MARGIN + (i % cols) * (CARD_W + GAP)
    const y = ctx.y + Math.floor(i / cols) * (CARD_H + GAP)
    doc.setFillColor(250, 250, 252)
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.rect(x, y, CARD_W, CARD_H, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(doc.splitTextToSize(c.label, CARD_W - 5)[0] ?? c.label, x + 2.5, y + 6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...(c.accent ?? BRAND))
    doc.text(doc.splitTextToSize(c.value, CARD_W - 5)[0] ?? c.value, x + 2.5, y + 14)
  })

  ctx.y += rows * (CARD_H + GAP) + 4
}

export interface TableCol {
  label: string
  width: number
  align?: 'left' | 'right'
  // * Draw this column in the monospace face — used for codes.
  mono?: boolean
}

export interface TableCell {
  text: string
  color?: Rgb
}

export type TableRow = Array<string | TableCell>

function cellOf(v: string | TableCell | undefined): TableCell {
  if (v == null) return { text: '' }
  return typeof v === 'string' ? { text: v } : v
}

// * Minimal table renderer — jspdf-autotable isn't a dependency and this only
// * needs a header, zebra rows, per-cell colour and a page break, so pulling one
// * in isn't worth it. The header repeats on every page it spills onto.
export function drawTable(
  ctx: PdfCtx,
  cols: TableCol[],
  rows: TableRow[],
  opts: { noData: string; totalRow?: TableRow },
) {
  const ROW_H = 7
  const HEAD_H = 8

  if (rows.length === 0) {
    ensureSpace(ctx, 12)
    ctx.doc.setFont('helvetica', 'italic')
    ctx.doc.setFontSize(9)
    ctx.doc.setTextColor(...MUTED)
    ctx.doc.text(opts.noData, MARGIN, ctx.y + 4)
    ctx.y += 12
    return
  }

  const drawHead = () => {
    const { doc } = ctx
    doc.setFillColor(...BRAND)
    doc.rect(MARGIN, ctx.y, CONTENT_W, HEAD_H, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)
    let x = MARGIN
    for (const c of cols) {
      const right = c.align === 'right'
      doc.text(c.label, right ? x + c.width - 2 : x + 2, ctx.y + 5.5, {
        align: right ? 'right' : 'left',
      })
      x += c.width
    }
    ctx.y += HEAD_H
  }

  const drawRow = (row: TableRow, idx: number, bold: boolean) => {
    const { doc } = ctx
    if (!bold && idx % 2 === 1) {
      doc.setFillColor(...ZEBRA)
      doc.rect(MARGIN, ctx.y, CONTENT_W, ROW_H, 'F')
    }
    let x = MARGIN
    cols.forEach((c, ci) => {
      const cell = cellOf(row[ci])
      doc.setFont(c.mono ? 'courier' : 'helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...(cell.color ?? INK))
      // * Truncate rather than wrap so every row keeps the same height.
      const text = doc.splitTextToSize(cell.text, c.width - 4)[0] ?? ''
      const right = c.align === 'right'
      doc.text(text, right ? x + c.width - 2 : x + 2, ctx.y + 4.8, {
        align: right ? 'right' : 'left',
      })
      x += c.width
    })
    ctx.y += ROW_H
  }

  ensureSpace(ctx, HEAD_H + ROW_H * 2)
  drawHead()

  rows.forEach((row, idx) => {
    if (ctx.y + ROW_H > PAGE_H - FOOTER_H) {
      newPage(ctx)
      drawHead()
    }
    drawRow(row, idx, false)
  })

  if (opts.totalRow) {
    if (ctx.y + ROW_H + 1 > PAGE_H - FOOTER_H) {
      newPage(ctx)
      drawHead()
    }
    ctx.doc.setDrawColor(...RULE)
    ctx.doc.setLineWidth(0.2)
    ctx.doc.line(MARGIN, ctx.y, PAGE_W - MARGIN, ctx.y)
    drawRow(opts.totalRow, -1, true)
    ctx.y += 1
  }

  ctx.y += 6
}

// * Page count is only known once everything is drawn, so footers are stamped
// * last, across every page.
export function stampFooters(doc: jsPDF, opts: { confidential: string; pageLabel: string }) {
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(...RULE)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, PAGE_H - 13, PAGE_W - MARGIN, PAGE_H - 13)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(150, 150, 150)
    doc.text(opts.confidential, MARGIN, PAGE_H - 9)
    doc.text(
      opts.pageLabel.replace('{n}', String(p)).replace('{total}', String(total)),
      PAGE_W - MARGIN,
      PAGE_H - 9,
      { align: 'right' },
    )
  }
}

export function downloadPdfBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// * Filename-safe slug from a club or batch label.
export function fileSlug(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'export'
  )
}
