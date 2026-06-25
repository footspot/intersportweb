// * Shared QR-code helpers used by the PDF builders.
// *
// * `buildClubShopQrDataUrl` renders a club-shop QR to a high-res PNG dataURL
// * with the club logo overlaid in the centre (white rounded card behind it).
// * Error-correction level H (~30% recovery) keeps the QR scannable despite the
// * ~24% centre overlay; modules stay pure black on white for print reliability.

import QRCode from 'qrcode'

export interface LoadedImage {
  dataUrl: string
  width: number
  height: number
}

// * Fetch an image and rasterise via canvas so jsPDF gets a clean PNG dataURL
// * with known dimensions. Loading through a blob object-URL keeps the canvas
// * untainted (no cross-origin export error) even for Supabase storage URLs.
export async function loadImage(url: string, maxDim = 1600): Promise<LoadedImage | null> {
  const loaded = await loadImageEl(url, maxDim)
  if (!loaded) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = loaded.width
    canvas.height = loaded.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(loaded.el, 0, 0, loaded.width, loaded.height)
    return { dataUrl: canvas.toDataURL('image/png'), width: loaded.width, height: loaded.height }
  } finally {
    loaded.revoke()
  }
}

interface LoadedImageEl {
  el: HTMLImageElement
  width: number
  height: number
  revoke: () => void
}

// * Load an image element from a blob object-URL (same-origin, so it never
// * taints a canvas). Caller MUST call `revoke()` once it's finished drawing.
async function loadImageEl(url: string, maxDim = 1600): Promise<LoadedImageEl | null> {
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (!res.ok) return null
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.crossOrigin = 'anonymous'
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('image_load_failed'))
        el.src = objectUrl
      })
      let w = img.naturalWidth || 1000
      let h = img.naturalHeight || 1000
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h)
        w = Math.max(1, Math.round(w * scale))
        h = Math.max(1, Math.round(h * scale))
      }
      return { el: img, width: w, height: h, revoke: () => URL.revokeObjectURL(objectUrl) }
    } catch (err) {
      URL.revokeObjectURL(objectUrl)
      throw err
    }
  } catch {
    return null
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// * Render the QR for `shopUrl` to a high-res PNG dataURL, overlaying the club
// * logo (loaded from `logoUrl`) centred inside a white rounded card.
export async function buildClubShopQrDataUrl(shopUrl: string, logoUrl: string | null): Promise<string> {
  const size = 1024
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, shopUrl, {
    errorCorrectionLevel: 'H',
    width: size,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  })

  const logo = logoUrl ? await loadImageEl(logoUrl) : null
  if (logo) {
    try {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const box = size * 0.24
        const bx = (size - box) / 2
        const radius = box * 0.16
        // * White card behind the logo (clears the modules underneath).
        ctx.fillStyle = '#ffffff'
        roundRect(ctx, bx, bx, box, box, radius)
        ctx.fill()
        // * Fit the logo inside the card with padding, preserving aspect ratio.
        const pad = box * 0.14
        const inner = box - pad * 2
        const aspect = logo.width / logo.height
        let w = inner
        let h = w / aspect
        if (h > inner) {
          h = inner
          w = h * aspect
        }
        ctx.drawImage(logo.el, (size - w) / 2, (size - h) / 2, w, h)
      }
    } finally {
      logo.revoke()
    }
  }

  return canvas.toDataURL('image/png')
}

// * Plain QR (no logo overlay) — kept compact (margin 1) for small print such
// * as per-voucher cells, while staying scannable thanks to the high module
// * resolution. Module size stays black-on-white for reliability.
export async function buildQrDataUrl(text: string): Promise<string> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: 'M',
    width: 512,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })
  return canvas.toDataURL('image/png')
}
