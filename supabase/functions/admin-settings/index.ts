// * admin-settings — edits the singleton site_settings row. Admin only.
// * Reading the row is open to everyone via the public select RLS policy, so
// * the storefront can fetch it directly through the supabase client.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'

interface SettingsPayload {
  clearance_active?: boolean
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const guard = await verifyAdmin(req)
  if (guard instanceof Response) return guard

  if (req.method !== 'PUT' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  }

  const sb = serviceClient()

  try {
    const body = (await req.json()) as SettingsPayload

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.clearance_active !== undefined) patch.clearance_active = !!body.clearance_active

    const { data: existing } = await sb
      .from('site_settings')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      const { data, error } = await sb
        .from('site_settings')
        .update(patch)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      return jsonResponse({ settings: data })
    }

    const { data, error } = await sb
      .from('site_settings')
      .insert(patch)
      .select()
      .single()
    if (error) throw error
    return jsonResponse({ settings: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-settings]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
