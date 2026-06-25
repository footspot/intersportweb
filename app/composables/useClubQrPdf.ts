// * Client-side single-page PDF generator for a club shop QR code.
// *
// * One A4 portrait page:
// *   – Intersport logo (top, centered)
// *   – Club name, large (brand-primary) + optional slogan
// *   – A big QR code that deep-links to the club's storefront
// *     (`{siteUrl}/?club={id}`), with the club logo overlaid in the centre.
// *   – The target URL + a short call-to-action under the QR.
// *
// * The QR uses error-correction level H (~30% recovery) so the centre logo
// * overlay (~24% of the QR area) never makes it unscannable. Modules stay
// * pure black on white for maximum scan reliability when printed.

import { jsPDF } from 'jspdf'
import { type LoadedImage, loadImage, buildClubShopQrDataUrl } from '~/composables/useQrCode'

export interface ClubQrPdfInput {
  intersportLogoUrl: string
  clubLogoUrl: string | null
  clubName: string
  slogan: string | null
  shopUrl: string
  i18n: {
    cta: string // * "Scannez ce QR code pour accéder à la boutique"
  }
}

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 18

function drawLogoFit(
  doc: jsPDF,
  img: LoadedImage | null,
  centerX: number,
  y: number,
  maxW: number,
  maxH: number,
) {
  if (!img) return
  const aspect = img.width / img.height
  let w = maxW
  let h = w / aspect
  if (h > maxH) {
    h = maxH
    w = h * aspect
  }
  doc.addImage(img.dataUrl, 'PNG', centerX - w / 2, y, w, h, undefined, 'FAST')
}

export async function buildClubQrPdf(input: ClubQrPdfInput): Promise<Blob> {
  const [intersportLogo, qrDataUrl] = await Promise.all([
    loadImage(input.intersportLogoUrl),
    buildClubShopQrDataUrl(input.shopUrl, input.clubLogoUrl),
  ])

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })

  // ──────────────────── Header: Intersport logo ────────────────────
  drawLogoFit(doc, intersportLogo, PAGE_W / 2, MARGIN, 80, 22)

  // ──────────────────── Club name + slogan ────────────────────
  let y = MARGIN + 22 + 22
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(3, 49, 249) // * brand-primary #0331f9
  doc.setFontSize(30)
  const nameLines = doc.splitTextToSize(input.clubName, PAGE_W - MARGIN * 2)
  doc.text(nameLines, PAGE_W / 2, y, { align: 'center' })
  y += (nameLines.length - 1) * 11

  if (input.slogan) {
    y += 12
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(110, 110, 110)
    doc.setFontSize(13)
    const sloganLines = doc.splitTextToSize(input.slogan, PAGE_W - MARGIN * 2)
    doc.text(sloganLines, PAGE_W / 2, y, { align: 'center' })
    y += (sloganLines.length - 1) * 6
  }

  // ──────────────────── Big QR code (centred) ────────────────────
  const QR_SIZE = 120
  const qrX = (PAGE_W - QR_SIZE) / 2
  const qrY = y + 16
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, QR_SIZE, QR_SIZE, undefined, 'FAST')

  // ──────────────────── Call-to-action + URL ────────────────────
  let by = qrY + QR_SIZE + 16
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(40, 40, 40)
  doc.setFontSize(14)
  const ctaLines = doc.splitTextToSize(input.i18n.cta, PAGE_W - MARGIN * 2)
  doc.text(ctaLines, PAGE_W / 2, by, { align: 'center' })
  by += ctaLines.length * 7 + 2

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(130, 130, 130)
  doc.setFontSize(10)
  doc.text(input.shopUrl, PAGE_W / 2, by, { align: 'center' })

  return doc.output('blob')
}

// * Trigger a browser download of the generated PDF.
export function downloadClubQrPdf(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
