// * Client-side PDF generator for a promo-code batch's USAGE — the report a
// * club asks for when it wants to know which of its codes have been redeemed
// * and which are still outstanding.
// *
// * Not to be confused with usePromoBatchPdf, which prints the cuttable
// * vouchers themselves. This one is the accounting view of the same batch:
// *
// *   – batch identity and conditions (value, min cart, validity, who absorbs)
// *   – six totals: codes issued / used / remaining, and the same in euros
// *   – one row per code: status, redemption date, and optionally the e-mail
// *
// * ! The totals describe the WHOLE batch, never the filtered view. Exporting
// * ! "Non utilisés" must still say how many of the batch were redeemed, or the
// * ! club reads "0 utilisés" off a document that simply hid them. The active
// * ! filter is printed in the meta block for the same reason.
// *
// * ! `used_by_email` is a customer's personal data. Disclosing it to a club is
// * ! a disclosure to a third party, so it is opt-in per export via
// * ! `includeEmails` — when false the column is dropped entirely rather than
// * ! masked, so nothing identifying survives in the file.

import { jsPDF } from 'jspdf'
import { loadImage } from '~/composables/useQrCode'
import {
  GREEN, INK, MUTED,
  MARGIN,
  type PdfCtx, type TableCol, type TableRow,
  drawDocHeader, drawMetaBlock, drawStatCards, drawTable,
  downloadPdfBlob, fmtInt, fmtMoney, sectionTitle, stampFooters,
} from '~/composables/usePdfDoc'

export interface PromoUsageCode {
  code: string
  // * Pre-formatted by the caller; null when never redeemed.
  usedAtLabel: string | null
  email: string | null
}

export interface PromoUsagePdfInput {
  intersportLogoUrl: string
  clubLogoUrl: string | null
  // * null for a global (non club-scoped) batch.
  clubName: string | null
  batchLabel: string
  scopeLabel: string
  amount: number
  minSubtotal: number | null
  validFromLabel: string | null
  validUntilLabel: string | null
  absorbsLabel: string
  note: string | null
  createdAtLabel: string
  generatedAtLabel: string
  // * Active filter / search on screen, null when the export is the full batch.
  filterLabel: string | null
  includeEmails: boolean
  // * Rows to print — already filtered and sorted by the caller.
  codes: PromoUsageCode[]
  // * Batch-wide counts, independent of any filter.
  totals: { issued: number; used: number }
  i18n: {
    title: string
    allClubs: string
    batch: string
    scope: string
    value: string
    minSubtotal: string
    validity: string
    absorbs: string
    note: string
    createdAt: string
    generatedAt: string
    filter: string
    unlimited: string
    none: string
    cardIssued: string
    cardUsed: string
    cardRemaining: string
    cardValueIssued: string
    cardValueUsed: string
    cardValueRemaining: string
    tableTitle: string
    colCode: string
    colStatus: string
    colUsedAt: string
    colUsedBy: string
    statusUsed: string
    statusUnused: string
    emailsOmitted: string
    noData: string
    page: string
    confidential: string
  }
}

export async function buildPromoUsagePdf(input: PromoUsagePdfInput): Promise<Blob> {
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

  // ── Batch identity + conditions ───────────────────────────────────────────
  const meta: Array<[string, string]> = [
    [input.i18n.batch, input.batchLabel],
    [input.i18n.scope, input.scopeLabel],
    [input.i18n.value, fmtMoney(input.amount)],
    [
      input.i18n.minSubtotal,
      input.minSubtotal != null ? fmtMoney(input.minSubtotal) : input.i18n.none,
    ],
    [
      input.i18n.validity,
      `${input.validFromLabel ?? input.i18n.none} - ${input.validUntilLabel ?? input.i18n.unlimited}`,
    ],
    [input.i18n.absorbs, input.absorbsLabel],
    [input.i18n.createdAt, input.createdAtLabel],
  ]
  if (input.note) meta.push([input.i18n.note, input.note])
  if (input.filterLabel) meta.push([input.i18n.filter, input.filterLabel])
  meta.push([input.i18n.generatedAt, input.generatedAtLabel])
  drawMetaBlock(ctx, meta, 44)

  // ── Totals, always for the whole batch ────────────────────────────────────
  const issued = input.totals.issued
  const used = input.totals.used
  const remaining = Math.max(0, issued - used)
  drawStatCards(ctx, [
    { label: input.i18n.cardIssued, value: fmtInt(issued) },
    { label: input.i18n.cardUsed, value: fmtInt(used), accent: GREEN },
    { label: input.i18n.cardRemaining, value: fmtInt(remaining) },
    { label: input.i18n.cardValueIssued, value: fmtMoney(issued * input.amount) },
    { label: input.i18n.cardValueUsed, value: fmtMoney(used * input.amount), accent: GREEN },
    { label: input.i18n.cardValueRemaining, value: fmtMoney(remaining * input.amount) },
  ])

  // ── One row per code ──────────────────────────────────────────────────────
  sectionTitle(ctx, input.i18n.tableTitle)

  const cols: TableCol[] = input.includeEmails
    ? [
        { label: input.i18n.colCode, width: 48, mono: true },
        { label: input.i18n.colStatus, width: 28 },
        { label: input.i18n.colUsedAt, width: 36 },
        { label: input.i18n.colUsedBy, width: 62 },
      ]
    : [
        { label: input.i18n.colCode, width: 62, mono: true },
        { label: input.i18n.colStatus, width: 40 },
        { label: input.i18n.colUsedAt, width: 72 },
      ]

  const rows: TableRow[] = input.codes.map((c) => {
    const isUsed = !!c.usedAtLabel
    // * Unused reads green here exactly as it does in the admin modal: for a
    // * club, an unredeemed code is the good news (budget still available).
    const status = {
      text: isUsed ? input.i18n.statusUsed : input.i18n.statusUnused,
      color: isUsed ? INK : GREEN,
    }
    const base: TableRow = [c.code, status, c.usedAtLabel ?? '—']
    if (input.includeEmails) base.push(c.email ?? '—')
    return base
  })

  drawTable(ctx, cols, rows, { noData: input.i18n.noData })

  // * Say plainly that the column was withheld, so a reader doesn't assume the
  // * codes were redeemed anonymously.
  if (!input.includeEmails) {
    ctx.doc.setFont('helvetica', 'italic')
    ctx.doc.setFontSize(7.5)
    ctx.doc.setTextColor(...MUTED)
    ctx.doc.text(input.i18n.emailsOmitted, MARGIN, ctx.y)
    ctx.y += 6
  }

  stampFooters(doc, { confidential: input.i18n.confidential, pageLabel: input.i18n.page })
  return doc.output('blob')
}

export const downloadPromoUsagePdf = downloadPdfBlob
