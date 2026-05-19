// * validate-payment-hash — browser-side UX check only.
// *
// * The Lyra Smartform's onSubmit callback receives `paymentData` with a
// * `clientAnswer` blob and an HMAC hash signed with the SHA256_HMAC test/
// * production key. This endpoint verifies the hash so the SPA can decide
// * whether to advance to the success page right away. The IPN is still the
// * only function allowed to mutate the order — this call is advisory.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'

async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const buf = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const hmacKey = Deno.env.get('SYSTEMPAY_HMAC_KEY')
  if (!hmacKey) return jsonResponse({ error: 'systempay_not_configured' }, { status: 500 })

  try {
    const body = await req.json()
    const clientAnswer = body?.clientAnswer
    const hash = body?.hash as string | undefined
    const hashKey = body?.hashKey as string | undefined
    if (!clientAnswer || !hash) {
      return jsonResponse({ ok: false, error: 'missing_fields' }, { status: 400 })
    }
    if (hashKey && hashKey !== 'sha256_hmac') {
      return jsonResponse({ ok: false, error: 'unsupported_hash_algorithm' }, { status: 400 })
    }
    const expected = await hmacSha256Hex(JSON.stringify(clientAnswer), hmacKey)
    if (expected !== hash) {
      return jsonResponse({ ok: false, error: 'invalid_hash' }, { status: 400 })
    }
    return jsonResponse({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ ok: false, error: msg }, { status: 500 })
  }
})
