// * Service-role Supabase client for write operations inside edge functions.
// * Never ship the service key to the browser — it is only read from Deno env here.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// * Supabase split the legacy single `SUPABASE_SERVICE_ROLE_KEY` JWT into a JSON
// * dict at `SUPABASE_SECRET_KEYS` with shape `{ "secret": "sb_secret_…" }` (and
// * sometimes other entries). Both env vars are populated during the transition,
// * so we read the new one first and fall back to the legacy string. Single
// * source of truth for every X-Internal-Call comparison + serviceClient().
export function serviceRoleKey(): string | undefined {
  const newDict = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (newDict) {
    try {
      const parsed = JSON.parse(newDict) as Record<string, string>
      if (parsed?.secret) return parsed.secret
    } catch {
      // * If the JSON ever malforms, fall through to the legacy var.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
}

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = serviceRoleKey()
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEYS (or legacy SUPABASE_SERVICE_ROLE_KEY) must be set')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

// * Client scoped to the caller's JWT — used only to identify the user,
// * never to perform privileged writes (those go through serviceClient()).
export function userClient(authHeader: string | null): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !anon) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set')
  }
  return createClient(url, anon, {
    global: { headers: authHeader ? { Authorization: authHeader } : {} },
    auth: { persistSession: false },
  })
}
