// * Outbound Footspot HTTP client.
// *
// *   Every call carries the five required headers (Authorization, partner id,
// *   signature, timestamp, idempotency). The signature is HMAC-SHA256 over the
// *   raw JSON body keyed by FOOTSPOT_SERVICE_SECRET.
import { signFootspotBody } from './hmac.ts'

export interface FootspotCallArgs {
  path: string
  bearer: string                                  // * per-club api_token OR shop-level service token
  body: Record<string, unknown>
  idempotencyKey?: string
}

export interface FootspotCallResult {
  ok: boolean
  status: number
  json: Record<string, unknown> | null
  raw: string
}

export async function postFootspot(args: FootspotCallArgs): Promise<FootspotCallResult> {
  const base = Deno.env.get('FOOTSPOT_FUNCTIONS_BASE_URL')
  const secret = Deno.env.get('FOOTSPOT_SERVICE_SECRET')
  const partnerId = Deno.env.get('INTERSPORT_PARTNER_ID')
  if (!base || !secret || !partnerId) {
    return {
      ok: false,
      status: 500,
      json: { error: 'footspot_client_not_configured' },
      raw: '',
    }
  }
  const url = `${base.replace(/\/$/, '')}/${args.path.replace(/^\//, '')}`
  const bodyStr = JSON.stringify(args.body)
  const ts = Math.floor(Date.now() / 1000).toString()
  const sig = await signFootspotBody(bodyStr, secret)
  const idem = args.idempotencyKey ?? crypto.randomUUID()

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':            'application/json',
      Authorization:             `Bearer ${args.bearer}`,
      'X-Intersport-Partner-Id': partnerId,
      'X-Signature':             sig,
      'X-Timestamp':             ts,
      'X-Idempotency-Key':       idem,
    },
    body: bodyStr,
  })
  const raw = await res.text()
  let json: Record<string, unknown> | null = null
  try {
    json = JSON.parse(raw)
  } catch {
    json = null
  }
  return { ok: res.ok, status: res.status, json, raw }
}
