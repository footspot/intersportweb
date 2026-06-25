// * Client-side PDF generator for a batch of promo codes.
// *
// *   Cover page (1)
// *     – Intersport logo (top-left) + club logo (top-right, if linked)
// *     – Batch summary: count, amount per code, min cart, validity window,
// *       absorbs-by, internal note
// *
// *   Voucher pages (1 page per VOUCHERS_PER_PAGE codes)
// *     – Cuttable grid: COLS × ROWS cards per A4.
// *     – Each card: code (large, monospace) + amount + tiny expiry line.
// *     – Shared metadata (min cart, absorbs-by, note) lives on the cover —
// *       no need to repeat it on every card.
// *
// * jsPDF doesn't render SVG; we always load PNGs via fetch + dataURL.
// * Intersport ships shop-logo.png at /shop-logo.png. The club logo URL is
// * already a public Supabase storage URL.

import { jsPDF } from 'jspdf'
import { type LoadedImage, loadImage, buildClubShopQrDataUrl, buildQrDataUrl } from '~/composables/useQrCode'

export interface PromoBatchPdfInput {
  // * Display strings — caller localises before passing in.
  intersportLogoUrl: string
  clubLogoUrl: string | null
  clubName: string | null
  // * Club-shop deep link — when set (club-scoped batch) a QR with the club
  // * logo centred is drawn on the cover. Null/omitted for global batches.
  shopUrl?: string | null
  batchLabel: string                 // * e.g. "Lot du 28/05/2026" — used in the filename
  codes: string[]
  amount: number
  minSubtotal: number | null
  validFrom: string | null           // * already-formatted date or null
  validUntil: string | null
  absorbsByLabel: string
  note: string | null
  i18n: {
    cover_title: string              // * "Lot de codes promo"
    cover_count: string              // * "Nombre de codes"
    cover_amount: string              // * "Valeur par code"
    cover_min: string                 // * "Panier minimum"
    cover_from: string                // * "Valide à partir du"
    cover_until: string               // * "Expire le"
    cover_absorbs: string             // * "Pris en charge par"
    cover_note: string                // * "Note interne"
    cover_unlimited: string           // * "Sans limite"
    cover_shop_qr: string             // * "Boutique du club" (QR label)
    voucher_title: string             // * "Bon d'achat"
    voucher_amount: string            // * "Valeur"
    voucher_min: string               // * "Panier min."
    voucher_until: string             // * "Valable jusqu'au"
    voucher_no_expiry: string         // * "Sans date d'expiration"
    voucher_single_use: string        // * "Code à usage unique"
    voucher_club_for: string          // * "Pour le club {club}"
  }
}

// * A4 portrait, mm units. Different logo boxes for cover vs voucher pages
// * because the horizontal Intersport mark is much wider than a square club
// * logo, and the per-page club mark needs to stay small enough to not steal
// * room from the voucher grid.
const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 18

// * Cover page logo boxes
const COVER_LOGO_H = 24
const COVER_INTERSPORT_W = 80     // * horizontal logo ≈ 5.7:1 → height auto-fits
const COVER_CLUB_W = 32

// * Per-voucher-page club mark (top-right strip)
const VOUCHER_HEADER_H = 16
const VOUCHER_CLUB_MAX_W = 28
const VOUCHER_CLUB_MAX_H = 12

// * Fit `img` inside an arbitrary max box, preserving aspect ratio, anchored
// * either to the left (x is the left edge) or to the right (x is the right
// * edge). y is always the top edge.
function drawLogoFit(
  doc: jsPDF,
  img: LoadedImage | null,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  anchor: 'left' | 'right',
) {
  if (!img) return
  const aspect = img.width / img.height
  let w = maxW
  let h = w / aspect
  if (h > maxH) {
    h = maxH
    w = h * aspect
  }
  const drawX = anchor === 'left' ? x : x - w
  doc.addImage(img.dataUrl, 'PNG', drawX, y, w, h, undefined, 'FAST')
}

function fmtMoney(v: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v)
}

export async function buildPromoBatchPdf(input: PromoBatchPdfInput): Promise<Blob> {
  // * Cover QR carries the club logo (club batches only). Each voucher cell
  // * gets a plain, logo-less QR of the same link — small but scannable, so a
  // * cut-out voucher still reaches the shop on its own.
  const wantCoverQr = !!(input.shopUrl && input.clubLogoUrl)
  const [intersportLogo, clubLogo, shopQrDataUrl, voucherQrDataUrl] = await Promise.all([
    loadImage(input.intersportLogoUrl),
    input.clubLogoUrl ? loadImage(input.clubLogoUrl) : Promise.resolve(null),
    wantCoverQr ? buildClubShopQrDataUrl(input.shopUrl as string, input.clubLogoUrl) : Promise.resolve(null),
    input.shopUrl ? buildQrDataUrl(input.shopUrl) : Promise.resolve(null),
  ])

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  // ──────────────────── Cover page ────────────────────
  drawLogoFit(doc, intersportLogo, MARGIN, MARGIN, COVER_INTERSPORT_W, COVER_LOGO_H, 'left')
  drawLogoFit(doc, clubLogo, PAGE_W - MARGIN, MARGIN, COVER_CLUB_W, COVER_LOGO_H, 'right')

  let y = MARGIN + COVER_LOGO_H + 18
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(3, 49, 249) // * brand-primary #0331f9
  doc.setFontSize(22)
  doc.text(input.i18n.cover_title, PAGE_W / 2, y, { align: 'center' })

  if (input.clubName) {
    y += 10
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(60, 60, 60)
    doc.setFontSize(13)
    doc.text(input.i18n.voucher_club_for.replace('{club}', input.clubName), PAGE_W / 2, y, { align: 'center' })
  }

  y += 20
  doc.setDrawColor(220, 220, 220)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
  y += 12

  // * Two-column key/value summary.
  doc.setFontSize(11)
  const rows: Array<[string, string]> = [
    [input.i18n.cover_count, String(input.codes.length)],
    [input.i18n.cover_amount, fmtMoney(input.amount)],
    [input.i18n.cover_min, input.minSubtotal != null ? fmtMoney(input.minSubtotal) : '—'],
    [input.i18n.cover_from, input.validFrom ?? '—'],
    [input.i18n.cover_until, input.validUntil ?? input.i18n.cover_unlimited],
    [input.i18n.cover_absorbs, input.absorbsByLabel],
  ]
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(110, 110, 110)
    doc.text(label, MARGIN, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(20, 20, 20)
    doc.text(value, PAGE_W - MARGIN, y, { align: 'right' })
    y += 9
  }

  if (input.note) {
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(110, 110, 110)
    doc.setFontSize(10)
    doc.text(input.i18n.cover_note, MARGIN, y)
    y += 6
    doc.setTextColor(50, 50, 50)
    const wrapped = doc.splitTextToSize(input.note, PAGE_W - MARGIN * 2)
    doc.text(wrapped, MARGIN, y)
    y += wrapped.length * 5
  }

  // * Club-shop QR (club-scoped batches only): centred low on the cover with
  // * the club logo in its middle, so the lot doubles as a shop flyer.
  if (shopQrDataUrl) {
    const QR_SIZE = 56
    const qrTop = Math.max(y + 16, 200)
    doc.addImage(shopQrDataUrl, 'PNG', (PAGE_W - QR_SIZE) / 2, qrTop, QR_SIZE, QR_SIZE, undefined, 'FAST')
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(3, 49, 249)
    doc.setFontSize(11)
    doc.text(input.i18n.cover_shop_qr, PAGE_W / 2, qrTop + QR_SIZE + 7, { align: 'center' })
  }

  // ──────────────────── Voucher grid pages ────────────────────
  // * Layout: 3 columns. When a club logo is shown in the per-page header,
  // * the grid drops to 7 rows (21 codes/page) to make room; otherwise 8
  // * rows (24/page). Code is rendered with auto-shrinking font so longer
  // * prefixes still fit on one line.
  const hasPageHeader = clubLogo !== null
  const COLS = 3
  const ROWS = hasPageHeader ? 7 : 8
  const PER_PAGE = COLS * ROWS
  const headerStrip = hasPageHeader ? VOUCHER_HEADER_H : 0
  const GRID_TOP = MARGIN + headerStrip + 4
  const GRID_LEFT = MARGIN
  const GRID_W = PAGE_W - MARGIN * 2
  const GRID_H = PAGE_H - GRID_TOP - MARGIN - 6 // * leave bottom space for footer
  const CELL_W = GRID_W / COLS
  const CELL_H = GRID_H / ROWS
  const CELL_PAD_X = 3

  const totalPages = Math.ceil(input.codes.length / PER_PAGE)

  for (let page = 0; page < totalPages; page++) {
    doc.addPage('a4', 'portrait')

    // * Per-page header: small club logo top-right, club name left of it.
    if (hasPageHeader) {
      drawLogoFit(
        doc,
        clubLogo,
        PAGE_W - MARGIN,
        MARGIN,
        VOUCHER_CLUB_MAX_W,
        VOUCHER_CLUB_MAX_H,
        'right',
      )
      if (input.clubName) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(110, 110, 110)
        doc.text(
          input.i18n.voucher_club_for.replace('{club}', input.clubName),
          MARGIN,
          MARGIN + 8,
        )
      }
    }

    // * Cut guides (light dashed lines between cards) — easier to scissor.
    doc.setDrawColor(220, 220, 220)
    doc.setLineDashPattern([1, 1], 0)
    doc.setLineWidth(0.2)
    for (let c = 1; c < COLS; c++) {
      const x = GRID_LEFT + c * CELL_W
      doc.line(x, GRID_TOP, x, GRID_TOP + GRID_H)
    }
    for (let r = 1; r < ROWS; r++) {
      const y = GRID_TOP + r * CELL_H
      doc.line(GRID_LEFT, y, GRID_LEFT + GRID_W, y)
    }
    doc.setLineDashPattern([], 0)

    const start = page * PER_PAGE
    const end = Math.min(start + PER_PAGE, input.codes.length)
    for (let i = start; i < end; i++) {
      const idx = i - start
      const col = idx % COLS
      const row = Math.floor(idx / COLS)
      const cx = GRID_LEFT + col * CELL_W
      const cy = GRID_TOP + row * CELL_H
      const code = input.codes[i]!
      const expiryLine = input.validUntil
        ? `${input.i18n.voucher_until} ${input.validUntil}`
        : input.i18n.voucher_no_expiry

      if (voucherQrDataUrl) {
        // * QR left (logo-less, ~20mm so a phone can scan it), text right.
        const qrSize = Math.min(CELL_H - 7, 22)
        const qx = cx + CELL_PAD_X
        const qy = cy + (CELL_H - qrSize) / 2
        // * Shared alias → jsPDF embeds the QR image once and reuses it.
        doc.addImage(voucherQrDataUrl, 'PNG', qx, qy, qrSize, qrSize, 'voucher-qr', 'FAST')

        const tx = qx + qrSize + 3
        const textW = cx + CELL_W - CELL_PAD_X - tx

        // * Top-right: amount in brand-secondary.
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(227, 11, 12)
        doc.text(fmtMoney(input.amount), tx, cy + 7, { align: 'left' })

        // * Middle: code, monospace, auto-shrink to the text column width.
        let fontSize = 14
        doc.setFont('courier', 'bold')
        doc.setFontSize(fontSize)
        doc.setTextColor(3, 49, 249)
        while (doc.getTextWidth(code) > textW && fontSize > 6) {
          fontSize -= 1
          doc.setFontSize(fontSize)
        }
        doc.text(code, tx, cy + CELL_H / 2 + 1, { align: 'left' })

        // * Bottom: expiry + single-use marker, tiny grey.
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.setTextColor(130, 130, 130)
        doc.text(expiryLine, tx, cy + CELL_H - 6.5, { align: 'left' })
        doc.text(input.i18n.voucher_single_use, tx, cy + CELL_H - 3, { align: 'left' })
      } else {
        // * Fallback (no shop URL): centred text-only voucher.
        const centerX = cx + CELL_W / 2

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(227, 11, 12)
        doc.text(fmtMoney(input.amount), centerX, cy + 6, { align: 'center' })

        const targetW = CELL_W - CELL_PAD_X * 2
        let fontSize = 18
        doc.setFont('courier', 'bold')
        doc.setFontSize(fontSize)
        doc.setTextColor(3, 49, 249)
        while (doc.getTextWidth(code) > targetW && fontSize > 7) {
          fontSize -= 1
          doc.setFontSize(fontSize)
        }
        doc.text(code, centerX, cy + CELL_H / 2 + 2, { align: 'center' })

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(130, 130, 130)
        doc.text(expiryLine, centerX, cy + CELL_H - 6, { align: 'center' })
        doc.text(input.i18n.voucher_single_use, centerX, cy + CELL_H - 2.5, { align: 'center' })
      }
    }

    // * Page footer.
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `${page + 1} / ${totalPages}  •  ${input.codes.length} ${input.i18n.voucher_title.toLowerCase()}`,
      PAGE_W / 2,
      PAGE_H - 6,
      { align: 'center' },
    )
  }

  return doc.output('blob')
}

// * Trigger a browser download of the generated PDF.
export function downloadPromoBatchPdf(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
