// * admin-settings — edits the singleton site_settings row. Admin only.
// * Reading the row is open to everyone via the public select RLS policy, so
// * the storefront can fetch it directly through the supabase client.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'

interface SettingsPayload {
  clearance_active?: boolean
  promo_banner_text?: string | null
  promo_banner_url?: string | null
  promo_banner_active?: boolean
  carousel_autoplay_seconds?: number
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
    // * Promo banner: trim text/url to null so an empty field falls back to the i18n default.
    if (body.promo_banner_text !== undefined) {
      patch.promo_banner_text = body.promo_banner_text?.trim() || null
    }
    if (body.promo_banner_url !== undefined) {
      patch.promo_banner_url = body.promo_banner_url?.trim() || null
    }
    if (body.promo_banner_active !== undefined) patch.promo_banner_active = !!body.promo_banner_active
    // * Carousel dwell time: clamp to the 1–60s the DB CHECK allows.
    if (body.carousel_autoplay_seconds !== undefined) {
      const n = Math.round(Number(body.carousel_autoplay_seconds))
      patch.carousel_autoplay_seconds = Math.min(60, Math.max(1, Number.isFinite(n) ? n : 3))
    }

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
