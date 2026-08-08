// * Client-side PDF generator for the "ordre de flocage" — the sheet handed
// * to the press operator. One A4 portrait page per club (clubs sorted by
// * name), mirroring the client's reference document:
// *   – header: club name + lot ref + freeze timestamp + covered period
// *   – TOTAL À FLOQUER counter (pieces · orders)
// *   – product × size quantity table (only the references kept for flocking)
// *   – excluded references listed as "sans flocage"
// *   – the lot's order list, for traceability only (pieces are anonymous)
// *   – press checklist footer + page numbers
// * The document is a French-only print artifact (like the invoice/purchase
// * order PDFs), so its strings live here rather than in i18n.

import { jsPDF } from 'jspdf'

export interface FlockingPdfProductRow {
  name: string
  reference: string
  sizes: Record<string, number>
  total: number
}

export interface FlockingPdfExcludedRow {
  name: string
  reference: string
  total: number
}

export interface FlockingPdfOrderRef {
  number: string
  client: string
  date: string // * dd/mm
}

export interface FlockingPdfClubBlock {
  clubName: string
  lotRef: string
  sizeCols: string[]
  products: FlockingPdfProductRow[]
  excluded: FlockingPdfExcludedRow[]
  orders: FlockingPdfOrderRef[]
  pieces: number
  ordersCount: number
}

export interface FlockingPdfInput {
  clubs: FlockingPdfClubBlock[] // * pre-sorted by club name
  frozenAt: string //   * "08/08/2026 à 18:30"
  periodLabel: string // * "Commandes du 28/07 au 08/08/2026"
}

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 16
const FOOTER_H = 34
const INK: [number, number, number] = [26, 30, 46]
const GRAY: [number, number, number] = [120, 126, 140]
const LIGHT: [number, number, number] = [225, 228, 234]
const PRIMARY: [number, number, number] = [3, 49, 249]

function letterSpaced(s: string) {
  return s.split('').join(' ')
}

export function buildFlockingOrderPdf(input: FlockingPdfInput): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const bottomLimit = PAGE_H - FOOTER_H

  input.clubs.forEach((club, clubIdx) => {
    if (clubIdx > 0) doc.addPage()

    // ──────────────────── Header ────────────────────
    let y = MARGIN + 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...GRAY)
    doc.text(letterSpaced('ORDRE DE FLOCAGE'), MARGIN, y)

    y += 9
    doc.setFontSize(20)
    doc.setTextColor(...INK)
    doc.text(club.clubName, MARGIN, y)

    y += 6.5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...GRAY)
    doc.text(`${club.lotRef}   ·   Figé le ${input.frozenAt}`, MARGIN, y)
    y += 4.5
    doc.text(input.periodLabel, MARGIN, y)

    // * TOTAL À FLOQUER counter, top-right.
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('TOTAL À FLOQUER', PAGE_W - MARGIN, MARGIN + 4, { align: 'right' })
    doc.setFontSize(26)
    doc.setTextColor(...PRIMARY)
    doc.text(String(club.pieces), PAGE_W - MARGIN, MARGIN + 14.5, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...GRAY)
    doc.text(`pièces  ·  ${club.ordersCount} commandes`, PAGE_W - MARGIN, MARGIN + 20, { align: 'right' })

    // ──────────────────── Product × size table ────────────────────
    y += 12
    const tableW = PAGE_W - MARGIN * 2
    const totW = 16
    const productW = Math.max(60, tableW - totW - club.sizeCols.length * 13)
    const sizeW = (tableW - productW - totW) / Math.max(1, club.sizeCols.length)
    const sizeX = (i: number) => MARGIN + productW + sizeW * i + sizeW / 2

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    doc.text('PRODUIT', MARGIN, y)
    club.sizeCols.forEach((s, i) => doc.text(s.toUpperCase(), sizeX(i), y, { align: 'center' }))
    doc.text('TOT.', PAGE_W - MARGIN, y, { align: 'right' })
    y += 2
    doc.setDrawColor(...INK)
    doc.setLineWidth(0.5)
    doc.line(MARGIN, y, PAGE_W - MARGIN, y)

    for (const p of club.products) {
      y += 8
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(...INK)
      doc.text(doc.splitTextToSize(p.name, productW - 4)[0] ?? '', MARGIN, y)
      club.sizeCols.forEach((s, i) => {
        const n = p.sizes[s]
        doc.setFontSize(11)
        doc.text(n ? String(n) : '—', sizeX(i), y, { align: 'center' })
      })
      doc.setTextColor(...GRAY)
      doc.setFontSize(10)
      doc.text(String(p.total), PAGE_W - MARGIN, y, { align: 'right' })
      y += 4
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...GRAY)
      doc.text(p.reference, MARGIN, y)
      y += 3
      doc.setDrawColor(...LIGHT)
      doc.setLineWidth(0.2)
      doc.line(MARGIN, y, PAGE_W - MARGIN, y)
    }

    // * Excluded references — printed so the press knows they exist untouched.
    for (const ex of club.excluded) {
      y += 5
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8)
      doc.setTextColor(...GRAY)
      doc.text(`${ex.name} ${ex.reference}  ·  ${ex.total} pièces  ·  sans flocage`, MARGIN, y)
    }

    // ──────────────────── Order list (traceability) ────────────────────
    y += 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...GRAY)
    doc.text(
      `COMMANDES DU LOT (${club.ordersCount})  —  pour traçabilité uniquement, aucune pièce n'est nominative`,
      MARGIN,
      y,
    )
    y += 2
    doc.setDrawColor(...LIGHT)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, y, PAGE_W - MARGIN, y)
    y += 5

    // * Fit as many columns as the widest order number + client label allow
    // * (the reference doc uses 4 with short codes; real CMD-… numbers get 3).
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    const widestNum = Math.max(0, ...club.orders.map((o) => doc.getTextWidth(o.number)))
    const COLS = Math.max(2, Math.min(4, Math.floor(tableW / (widestNum + 26))))
    const cellW = tableW / COLS
    let col = 0
    for (const o of club.orders) {
      if (y > bottomLimit) {
        doc.addPage()
        y = MARGIN + 6
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(...GRAY)
        doc.text(`${letterSpaced('ORDRE DE FLOCAGE')}  —  ${club.clubName} (suite)`, MARGIN, y)
        y += 8
        doc.setFontSize(7.5)
        col = 0
      }
      const x = MARGIN + col * cellW
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...INK)
      doc.text(o.number, x, y)
      const numW = doc.getTextWidth(o.number)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...GRAY)
      doc.text(`${o.client}  ${o.date}`, x + numW + 2, y)
      col += 1
      if (col === COLS) {
        col = 0
        y += 4.5
      }
    }
  })

  // ──────────────────── Footers (needs final page count) ────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    let fy = PAGE_H - FOOTER_H + 8
    doc.setDrawColor(...LIGHT)
    doc.setLineWidth(0.2)
    doc.line(MARGIN, fy - 5, PAGE_W - MARGIN, fy - 5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...INK)
    doc.text('PRESSE RÉGLÉE  [    ]        LOT TERMINÉ  [    ]        FLOQUÉ PAR  ____________________', MARGIN, fy)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...GRAY)
    doc.text(`Page ${p} / ${pages}`, PAGE_W - MARGIN, fy, { align: 'right' })
    fy += 6
    doc.setFontSize(7)
    doc.text(
      doc.splitTextToSize(
        "Rappel : toutes les pièces de ce tableau portent le même logo et sont interchangeables au sein d'une même référence et d'une même taille. La ventilation par commande se fait ensuite avec les bons de préparation.",
        PAGE_W - MARGIN * 2,
      ),
      MARGIN,
      fy,
    )
  }

  return doc.output('blob')
}
