// * admin-contact — edits the singleton contact_info row. Admin only.
// * Creates the row the first time it's saved. GET is open to everyone via RLS
// * so the public /contact page can read it directly.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'

interface SocialLink {
  platform: string
  url: string
  icon?: string
}

interface ContactPayload {
  address?: string | null
  phone?: string | null
  email?: string | null
  google_maps_embed_url?: string | null
  who_we_are?: string | null
  social_media?: SocialLink[]
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
    const body = (await req.json()) as ContactPayload

    const patch = {
      address: body.address?.trim() || null,
      phone: body.phone?.trim() || null,
      email: body.email?.trim() || null,
      google_maps_embed_url: body.google_maps_embed_url?.trim() || null,
      who_we_are: body.who_we_are?.trim() || null,
      social_media: Array.isArray(body.social_media) ? body.social_media : [],
      updated_at: new Date().toISOString(),
    }

    // * Upsert the singleton — if no row exists, insert; otherwise update the
    // * most recent one (there should only ever be one).
    const { data: existing } = await sb
      .from('contact_info')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      const { data, error } = await sb
        .from('contact_info')
        .update(patch)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      return jsonResponse({ contact: data })
    }

    const { data, error } = await sb
      .from('contact_info')
      .insert(patch)
      .select()
      .single()
    if (error) throw error
    return jsonResponse({ contact: data }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-contact]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
