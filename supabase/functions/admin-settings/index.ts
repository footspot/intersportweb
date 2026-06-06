// * admin-settings — edits the singleton site_settings row. Admin only.
// * Reading the row is open to everyone via the public select RLS policy, so
// * the storefront can fetch it directly through the supabase client.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { parseMultipartFiles, uploadImage, removeImage } from '../_shared/multipart.ts'

// * The three static entry cards whose cover image + text color are configurable.
const ENTRY_CARDS = ['catalog', 'shop', 'clearance'] as const
const ENTRY_COVER_BUCKET = 'entry-card-covers'

interface SettingsPayload {
  clearance_active?: boolean
  promo_banner_text?: string | null
  promo_banner_url?: string | null
  promo_banner_active?: boolean
  carousel_autoplay_seconds?: number
  // * Static entry-card personalization (text colors + clear-cover flags).
  catalog_text_color?: string | null
  shop_text_color?: string | null
  clearance_text_color?: string | null
  catalog_cover_gradient?: boolean
  shop_cover_gradient?: boolean
  clearance_cover_gradient?: boolean
  clear_catalog_cover?: boolean
  clear_shop_cover?: boolean
  clear_clearance_cover?: boolean
}

// * Optional color: a valid hex or null (card then falls back to black).
function colorOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
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

  // * Cover images arrive as multipart/form-data; everything else can be JSON.
  const contentType = req.headers.get('content-type') ?? ''
  const isMultipart = contentType.startsWith('multipart/form-data')

  // * Track uploads so we can roll them back if the DB write fails.
  const uploaded: string[] = []

  try {
    const { body, files } = isMultipart
      ? await parseMultipartFiles<SettingsPayload>(req).then((r) => ({ body: r.data, files: r.files }))
      : { body: (await req.json()) as SettingsPayload, files: {} as Record<string, File> }

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
    // * Static entry-card overlay text colors (null when invalid/empty) + gradient toggle.
    for (const key of ENTRY_CARDS) {
      const colorField = `${key}_text_color` as keyof SettingsPayload
      if (body[colorField] !== undefined) patch[`${key}_text_color`] = colorOrNull(body[colorField])
      const gradientField = `${key}_cover_gradient` as keyof SettingsPayload
      if (body[gradientField] !== undefined) patch[`${key}_cover_gradient`] = !!body[gradientField]
    }

    // * Fetch current row (id + existing cover paths so we can replace/clear them).
    const coverCols = ENTRY_CARDS.map((k) => `${k}_cover_image_path`).join(', ')
    const { data: existing } = await sb
      .from('site_settings')
      .select(`id, ${coverCols}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // * Per-card cover: new upload, explicit clear, else leave untouched.
    const staleCovers: string[] = []
    for (const key of ENTRY_CARDS) {
      const file = files[`${key}_cover`]
      const clearFlag = (body as Record<string, unknown>)[`clear_${key}_cover`]
      const previous =
        (existing as Record<string, string | null> | null)?.[`${key}_cover_image_path`] ?? null
      if (file) {
        const path = await uploadImage(sb, ENTRY_COVER_BUCKET, file)
        uploaded.push(path)
        patch[`${key}_cover_image_path`] = path
        if (previous) staleCovers.push(previous)
      } else if (clearFlag) {
        patch[`${key}_cover_image_path`] = null
        if (previous) staleCovers.push(previous)
      }
    }

    let result
    if (existing?.id) {
      const { data, error } = await sb
        .from('site_settings')
        .update(patch)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      result = data
    } else {
      const { data, error } = await sb
        .from('site_settings')
        .insert(patch)
        .select()
        .single()
      if (error) throw error
      result = data
    }

    // * Write succeeded — drop replaced/cleared covers.
    for (const p of staleCovers) await removeImage(sb, ENTRY_COVER_BUCKET, p)

    return jsonResponse({ settings: result }, existing?.id ? {} : { status: 201 })
  } catch (err) {
    // * Roll back any just-uploaded covers so they don't orphan in storage.
    for (const p of uploaded) await removeImage(sb, ENTRY_COVER_BUCKET, p)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-settings]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
