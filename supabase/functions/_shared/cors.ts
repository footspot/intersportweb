const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://intesport-web.netlify.app',
]

// * Netlify deploy-preview URLs: https://<id>--intesport-web.netlify.app
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/[a-z0-9]+-{1,2}intesport-web\.netlify\.app$/,
]

// * Only echo back origins on the allowlist — unknown origins get an empty
// * Access-Control-Allow-Origin which the browser treats as blocked.
export function corsHeaders(origin: string | null = null): Record<string, string> {
  const isAllowed =
    origin &&
    (ALLOWED_ORIGINS.includes(origin) ||
      ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin)))
  const allowed = isAllowed ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
  }
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      // * Preflight already blocked unknown origins — data responses use * safely.
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req.headers.get('Origin')) })
  }
  return null
}
