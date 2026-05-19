// * generate-colissimo-label — internal call from the orders trigger.
// *
// * Builds an SLS REST 3.1 request for the order, posts to La Poste, stores
// * the returned PDF in the `labels` private bucket, and writes the parcel
// * number + label path back onto the order. On failure logs to label_errors
// * for the admin retry queue.
// *
// * Required env:
// *   COLISSIMO_API_KEY         Cbox API key (sandbox + prod use same key)
// *   COLISSIMO_CONTRACT        contract number (numeric)
// *   COLISSIMO_ENDPOINT        defaults to the sandbox URL — set to prod when ready
// *   COLISSIMO_SENDER_*        sender address fields (Intersport HQ)
// *   COLISSIMO_PRODUCT_CODE    'DOS' (default) / 'DOM' / 'COL' / 'CORE'
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'

interface Payload {
  order_id: string
}

interface SlsLabelV2 {
  parcelNumber?: string
  parcelNumberPartner?: string
  pdfUrl?: string
  label?: string // * base64 PDF (legacy inline payload)
}
interface SlsLabelResponse {
  messages?: Array<{ id?: string; type?: string; messageContent?: string }>
  // * The v2 schema returns `labelV2Response`. The historical `labelResponse`
  // * key is kept as a fallback for older deployments / docs.
  labelV2Response?: SlsLabelV2
  labelResponse?: SlsLabelV2
}

function depositDate(): string {
  // * SLS REST expects ISO `yyyy-MM-dd` — `dd/MM/yyyy` returns HTTP 400
  // * "Invalid JSON format ... Cannot deserialize value of type java.util.Date".
  return new Date().toISOString().slice(0, 10)
}

// * Colissimo SLS REST success responses are multipart/related with two
// * parts: a JSON metadata part (Content-ID `<jsonInfos>` carrying
// * labelResponse + messages) and a binary PDF part (Content-ID `<label>`).
// * Headers separator is CRLF CRLF; boundary comes from the response
// * Content-Type. Parse into a map keyed by Content-ID.
function parseMultipart(buf: Uint8Array, boundary: string): Map<string, Uint8Array> {
  const sep = new TextEncoder().encode(`--${boundary}`)
  const positions: number[] = []
  outer: for (let i = 0; i <= buf.length - sep.length; i++) {
    for (let j = 0; j < sep.length; j++) {
      if (buf[i + j] !== sep[j]) continue outer
    }
    positions.push(i)
    i += sep.length - 1
  }
  const parts = new Map<string, Uint8Array>()
  for (let p = 0; p < positions.length - 1; p++) {
    const partStart = positions[p] + sep.length
    const partEnd = positions[p + 1]
    const part = buf.subarray(partStart, partEnd)
    let hsIdx = -1
    for (let j = 0; j <= part.length - 4; j++) {
      if (part[j] === 0x0d && part[j + 1] === 0x0a && part[j + 2] === 0x0d && part[j + 3] === 0x0a) {
        hsIdx = j
        break
      }
    }
    if (hsIdx < 0) continue
    const headers = new TextDecoder().decode(part.subarray(0, hsIdx))
    let bodyEnd = part.length
    while (bodyEnd > hsIdx + 4 && (part[bodyEnd - 1] === 0x0a || part[bodyEnd - 1] === 0x0d)) bodyEnd--
    const body = part.subarray(hsIdx + 4, bodyEnd)
    const idMatch = headers.match(/Content-ID:\s*<([^>]+)>/i)
    if (idMatch) parts.set(idMatch[1], body)
  }
  return parts
}

function extractBoundary(contentType: string): string | null {
  const m = contentType.match(/boundary="?([^";]+)"?/i)
  return m ? m[1] : null
}

function countryCodeFor(country: string | undefined): string {
  if (!country) return 'FR'
  const m: Record<string, string> = {
    France: 'FR', Belgique: 'BE', Belgium: 'BE',
    Luxembourg: 'LU', Suisse: 'CH', Switzerland: 'CH',
    Allemagne: 'DE', Germany: 'DE',
    Espagne: 'ES', Spain: 'ES',
    Italie: 'IT', Italy: 'IT',
    'Pays-Bas': 'NL', Netherlands: 'NL',
  }
  // * Don't fold this into one ?? + ternary — operator precedence groups it
  // * as `(m[c] ?? (c.length===2)) ? c.toUpperCase() : 'FR'`, which sends
  // * literal country names like "FRANCE" to Colissimo and gets rejected.
  if (m[country]) return m[country]
  if (country.length === 2) return country.toUpperCase()
  return 'FR'
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  // * Internal-only: caller must present the service role key in X-Internal-Call.
  const internalKey = req.headers.get('X-Internal-Call')
  const serviceRole = serviceRoleKey()
  if (!internalKey || !serviceRole || internalKey !== serviceRole) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 })
  }

  const apiKey = Deno.env.get('COLISSIMO_API_KEY')
  const contractNumber = Deno.env.get('COLISSIMO_CONTRACT')
  // * NOTE: the path component is SlsServiceWSRest (JSON) — not SlsServiceWS,
  // * which is the SOAP variant at the same host. Mis-setting this returns a
  // * `multipart/xop+xml` SOAP fault because the SOAP server tries to parse
  // * our JSON body as XML. Sandbox prefix is `/sandbox`; production omits it.
  const endpoint =
    Deno.env.get('COLISSIMO_ENDPOINT') ?? 'https://ws.colissimo.fr/sandbox/sls-ws/SlsServiceWSRest/2.0'
  const productCode = Deno.env.get('COLISSIMO_PRODUCT_CODE') ?? 'DOS'
  if (!apiKey || !contractNumber) {
    return jsonResponse({ error: 'colissimo_not_configured' }, { status: 500 })
  }

  const sb = serviceClient()

  let orderId = ''
  try {
    const body = (await req.json()) as Payload
    orderId = body.order_id
    if (!orderId) return jsonResponse({ error: 'order_id_required' }, { status: 400 })

    const { data: order, error } = await sb
      .from('orders')
      .select('*, club:clubs(name)')
      .eq('id', orderId)
      .single()
    if (error || !order) return jsonResponse({ error: 'order_not_found' }, { status: 404 })

    if (order.delivery_method !== 'colissimo') {
      return jsonResponse({ error: 'not_a_colissimo_order' }, { status: 400 })
    }
    if (order.label_pdf_path) {
      return jsonResponse({ ok: true, idempotent: true, label_pdf_path: order.label_pdf_path })
    }

    // * Total weight from order_items × products.weight_grams. Falls back to
    // * 500 g per item if any product lacks a weight (Colissimo rejects 0 kg).
    const { data: items } = await sb
      .from('order_items')
      .select('quantity, product:products(weight_grams)')
      .eq('order_id', order.id)
    let totalGrams = 0
    for (const it of items ?? []) {
      const g = (it as any).product?.weight_grams ?? 500
      totalGrams += (g || 500) * (it as any).quantity
    }
    const weightKg = Math.max(0.1, Math.round((totalGrams / 1000) * 100) / 100)

    const addr = order.shipping_address ?? {}
    const fullName: string = addr.full_name ?? ''
    const [firstName, ...rest] = fullName.split(' ').filter(Boolean)
    const lastName = rest.join(' ')

    const slsBody = {
      contractNumber,
      password: '',
      outputFormat: { x: 0, y: 0, outputPrintingType: 'PDF_A4_300dpi' },
      letter: {
        service: {
          productCode,
          depositDate: depositDate(),
          orderNumber: order.order_number,
        },
        parcel: { weight: weightKg },
        sender: {
          senderParcelRef: order.order_number,
          address: {
            companyName: Deno.env.get('COLISSIMO_SENDER_COMPANY') ?? 'Intersport Club IDF',
            line2: Deno.env.get('COLISSIMO_SENDER_LINE2') ?? '',
            countryCode: Deno.env.get('COLISSIMO_SENDER_COUNTRY') ?? 'FR',
            city: Deno.env.get('COLISSIMO_SENDER_CITY') ?? '',
            zipCode: Deno.env.get('COLISSIMO_SENDER_ZIP') ?? '',
          },
        },
        addressee: {
          address: {
            companyName: order.club?.name ?? '',
            lastName: lastName || fullName || 'Client',
            firstName: firstName ?? '',
            line2: addr.line1 ?? '',
            line3: addr.line2 ?? null,
            countryCode: countryCodeFor(addr.country),
            city: addr.city ?? '',
            zipCode: addr.postal_code ?? '',
            email: addr.email ?? null,
            mobileNumber: addr.phone ?? null,
          },
        },
      },
    }

    const url = `${endpoint.replace(/\/$/, '')}/generateLabel`
    const slsRes = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(slsBody),
    })

    // * SLS REST responses come in two shapes:
    // *   - plain JSON when the API rejected the request (error 4xx)
    // *   - multipart/related on success: `<jsonInfos>` part (labelResponse
    // *     + messages) + `<label>` part (raw PDF bytes).
    // * Read the body as bytes once so the binary PDF survives.
    const contentType = slsRes.headers.get('content-type') ?? ''
    const rawBuf = new Uint8Array(await slsRes.arrayBuffer())

    let slsJson: SlsLabelResponse | null = null
    let pdfBytes: Uint8Array | null = null

    if (contentType.startsWith('multipart/related')) {
      const boundary = extractBoundary(contentType)
      if (!boundary) {
        await sb.from('label_errors').insert({
          order_id: order.id,
          error_code: 'no_boundary',
          error_message: 'multipart response without boundary param',
          raw_response: { content_type: contentType },
        })
        return jsonResponse({ error: 'sls_no_boundary' }, { status: 502 })
      }
      const parts = parseMultipart(rawBuf, boundary)
      const jsonPart = parts.get('jsonInfos') ?? parts.get('root.message@cxf.apache.org')
      if (jsonPart) {
        try {
          slsJson = JSON.parse(new TextDecoder().decode(jsonPart)) as SlsLabelResponse
        } catch (_) {
          // fall through — recorded below
        }
      }
      const labelPart = parts.get('label') ?? parts.get('attachment')
      if (labelPart && labelPart.length > 0) pdfBytes = labelPart
    } else if (contentType.includes('application/json')) {
      try {
        slsJson = JSON.parse(new TextDecoder().decode(rawBuf)) as SlsLabelResponse
      } catch (_) {
        // fall through
      }
    }

    if (!slsRes.ok || !slsJson) {
      const text = new TextDecoder().decode(rawBuf).slice(0, 2000)
      const errCode = `HTTP_${slsRes.status}`
      await sb.from('label_errors').insert({
        order_id: order.id,
        error_code: errCode,
        error_message: `SLS ${slsRes.status}: ${text.slice(0, 500)}`,
        raw_response: { content_type: contentType, body: text },
      })
      return jsonResponse({ error: 'sls_error', code: errCode }, { status: 502 })
    }

    const errMsg = (slsJson.messages ?? []).find((m) => m.type && m.type !== 'INFOS')
    if (errMsg) {
      await sb.from('label_errors').insert({
        order_id: order.id,
        error_code: errMsg.id ?? null,
        error_message: errMsg.messageContent ?? 'SLS error',
        raw_response: slsJson as unknown as Record<string, unknown>,
      })
      return jsonResponse({ error: 'sls_error', detail: errMsg }, { status: 502 })
    }

    const label = slsJson.labelV2Response ?? slsJson.labelResponse
    const parcelNumber = label?.parcelNumber
    if (!parcelNumber) {
      await sb.from('label_errors').insert({
        order_id: order.id,
        error_code: 'no_parcel_number',
        error_message: 'SLS response missing parcelNumber',
        raw_response: slsJson as unknown as Record<string, unknown>,
      })
      return jsonResponse({ error: 'sls_no_parcel_number' }, { status: 502 })
    }

    // * Fall back to the older JSON-only response shapes (pdfUrl or inline
    // * base64 `label` field) if the multipart binary part wasn't present.
    if (!pdfBytes) {
      if (label?.pdfUrl) {
        const pdfRes = await fetch(label.pdfUrl)
        if (!pdfRes.ok) {
          await sb.from('label_errors').insert({
            order_id: order.id,
            error_code: `pdf_${pdfRes.status}`,
            error_message: 'failed to fetch label PDF',
            raw_response: { pdfUrl: label.pdfUrl },
          })
          return jsonResponse({ error: 'pdf_download_failed' }, { status: 502 })
        }
        pdfBytes = new Uint8Array(await pdfRes.arrayBuffer())
      } else if (label?.label) {
        pdfBytes = Uint8Array.from(atob(label.label), (c) => c.charCodeAt(0))
      }
    }
    if (!pdfBytes) {
      await sb.from('label_errors').insert({
        order_id: order.id,
        error_code: 'no_pdf',
        error_message: 'SLS response carried neither inline part nor pdfUrl/label',
        raw_response: slsJson as unknown as Record<string, unknown>,
      })
      return jsonResponse({ error: 'sls_no_pdf' }, { status: 502 })
    }

    const labelPath = `${order.id}/label.pdf`
    const { error: upErr } = await sb.storage
      .from('labels')
      .upload(labelPath, pdfBytes, { contentType: 'application/pdf', upsert: true })
    if (upErr) {
      await sb.from('label_errors').insert({
        order_id: order.id,
        error_code: 'storage_upload_failed',
        error_message: upErr.message,
      })
      return jsonResponse({ error: 'storage_upload_failed' }, { status: 500 })
    }

    await sb
      .from('orders')
      .update({
        shipping_tracking: parcelNumber,
        label_pdf_path: labelPath,
        label_generated_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    return jsonResponse({
      ok: true,
      order_id: order.id,
      parcel_number: parcelNumber,
      label_pdf_path: labelPath,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[generate-colissimo-label]', msg)
    if (orderId) {
      try {
        await sb.from('label_errors').insert({
          order_id: orderId,
          error_code: 'exception',
          error_message: msg,
        })
      } catch (_) {
        // ignore
      }
    }
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
