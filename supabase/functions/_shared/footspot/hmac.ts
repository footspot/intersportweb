// * Footspot HMAC — shared between every Intersport ↔ Footspot call.
// *
// *   Signature scheme (matches FOOTSPOT_INTEGRATION.md §"Request security
// *   headers"): `sha256=` + HMAC-SHA256 over the raw request body bytes,
// *   keyed by FOOTSPOT_SERVICE_SECRET. Timestamps reject if drift > 300s.

const MAX_DRIFT_SECONDS = 300

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function signFootspotBody(body: string, secret: string): Promise<string> {
  return 'sha256=' + (await hmacSha256Hex(body, secret))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyFootspotHmac(req: Request): Promise<
  | { ok: true; body: string; idempotencyKey: string }
  | { ok: false; status: number; error: string }
> {
  const secret = Deno.env.get('FOOTSPOT_SERVICE_SECRET')
  if (!secret) return { ok: false, status: 500, error: 'FOOTSPOT_SERVICE_SECRET missing' }

  const sigHeader = req.headers.get('X-Signature')
  const tsHeader = req.headers.get('X-Timestamp')
  const idemHeader = req.headers.get('X-Idempotency-Key')
  if (!sigHeader || !tsHeader || !idemHeader) {
    return { ok: false, status: 400, error: 'missing_signature_headers' }
  }
  const ts = Number(tsHeader)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_DRIFT_SECONDS) {
    return { ok: false, status: 401, error: 'timestamp_drift' }
  }

  const body = await req.text()
  const expected = await signFootspotBody(body, secret)
  if (!timingSafeEqual(expected, sigHeader)) {
    return { ok: false, status: 401, error: 'invalid_signature' }
  }

  return { ok: true, body, idempotencyKey: idemHeader }
}
