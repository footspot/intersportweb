// * admin-home-sections — CRUD for the dynamic entry-row sections shown on
// * slide 0 of the home carousel. Each section now holds multiple URL links
// * (managed via admin-home-section-links). Admin only.
// * POST/PUT accept multipart/form-data (data + optional logo file) or JSON.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { parseMultipartFiles, uploadImage, removeImage } from '../_shared/multipart.ts'

const BUCKET = 'home-section-logos'
const COVER_BUCKET = 'home-section-covers'

interface SectionData {
  id?: string
  name?: string
  description?: string | null
  accent_color?: string
  text_color?: string | null
  cover_gradient?: boolean
  is_visible?: boolean
  sort_order?: number
  clear_logo?: boolean
  clear_cover?: boolean
}

function normalizeColor(value: string | undefined, fallback = '#0331f9'): string {
  if (!value) return fallback
  const v = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback
}

// * Optional color: a valid hex or null (card then falls back to its default).
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

  const sb = serviceClient()
  const url = new URL(req.url)
  const contentType = req.headers.get('content-type') ?? ''
  const isMultipart = contentType.startsWith('multipart/form-data')

  try {
    if (req.method === 'POST') {
      const { data, files } = isMultipart
        ? await parseMultipartFiles<SectionData>(req)
        : { data: (await req.json()) as SectionData, files: {} as Record<string, File> }
      const logo = files.logo ?? null
      const cover = files.cover ?? null

      if (!data?.name?.trim())
        return jsonResponse({ error: 'name required' }, { status: 400 })

      let logoPath: string | null = null
      let coverPath: string | null = null
      if (logo) logoPath = await uploadImage(sb, BUCKET, logo)
      if (cover) coverPath = await uploadImage(sb, COVER_BUCKET, cover)

      const { data: section, error } = await sb
        .from('home_sections')
        .insert({
          name: data.name.trim(),
          description: data.description?.toString().trim() || null,
          logo_path: logoPath,
          cover_image_path: coverPath,
          accent_color: normalizeColor(data.accent_color),
          text_color: colorOrNull(data.text_color),
          cover_gradient: data.cover_gradient ?? true,
          is_visible: data.is_visible ?? true,
          sort_order: data.sort_order ?? 0,
        })
        .select()
        .single()
      if (error) {
        if (logoPath) await removeImage(sb, BUCKET, logoPath)
        if (coverPath) await removeImage(sb, COVER_BUCKET, coverPath)
        throw error
      }
      return jsonResponse({ section }, { status: 201 })
    }

    if (req.method === 'PUT') {
      const { data, files } = isMultipart
        ? await parseMultipartFiles<SectionData>(req)
        : { data: (await req.json()) as SectionData, files: {} as Record<string, File> }
      const logo = files.logo ?? null
      const cover = files.cover ?? null

      if (!data?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: current, error: cErr } = await sb
        .from('home_sections')
        .select('logo_path, cover_image_path')
        .eq('id', data.id)
        .single()
      if (cErr) throw cErr
      const previousLogo = current?.logo_path ?? null
      const previousCover = current?.cover_image_path ?? null

      const patch: Record<string, unknown> = {}
      if (data.name !== undefined) patch.name = data.name.trim()
      if (data.description !== undefined)
        patch.description = data.description?.toString().trim() || null
      if (data.accent_color !== undefined)
        patch.accent_color = normalizeColor(data.accent_color)
      if (data.text_color !== undefined)
        patch.text_color = colorOrNull(data.text_color)
      if (data.cover_gradient !== undefined) patch.cover_gradient = !!data.cover_gradient
      if (data.is_visible !== undefined) patch.is_visible = !!data.is_visible
      if (data.sort_order !== undefined) patch.sort_order = data.sort_order

      let newLogoPath: string | null = null
      if (logo) {
        newLogoPath = await uploadImage(sb, BUCKET, logo)
        patch.logo_path = newLogoPath
      } else if (data.clear_logo) {
        patch.logo_path = null
      }

      let newCoverPath: string | null = null
      if (cover) {
        newCoverPath = await uploadImage(sb, COVER_BUCKET, cover)
        patch.cover_image_path = newCoverPath
      } else if (data.clear_cover) {
        patch.cover_image_path = null
      }

      const { data: section, error } = await sb
        .from('home_sections')
        .update(patch)
        .eq('id', data.id)
        .select()
        .single()
      if (error) {
        if (newLogoPath) await removeImage(sb, BUCKET, newLogoPath)
        if (newCoverPath) await removeImage(sb, COVER_BUCKET, newCoverPath)
        throw error
      }

      if ((logo || data.clear_logo) && previousLogo && previousLogo !== newLogoPath) {
        await removeImage(sb, BUCKET, previousLogo)
      }
      if ((cover || data.clear_cover) && previousCover && previousCover !== newCoverPath) {
        await removeImage(sb, COVER_BUCKET, previousCover)
      }

      return jsonResponse({ section })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })

      // * Cascade-delete also removes section links by FK; collect their logos
      // * for cleanup since they live in a different bucket.
      const { data: links } = await sb
        .from('home_section_links')
        .select('logo_path')
        .eq('section_id', id)

      const { data: current } = await sb
        .from('home_sections')
        .select('logo_path, cover_image_path')
        .eq('id', id)
        .single()

      const { error } = await sb.from('home_sections').delete().eq('id', id)
      if (error) throw error

      if (current?.logo_path) await removeImage(sb, BUCKET, current.logo_path)
      if (current?.cover_image_path)
        await removeImage(sb, COVER_BUCKET, current.cover_image_path)
      const linkLogos = (links ?? [])
        .map((l) => (l as { logo_path: string | null }).logo_path)
        .filter((p): p is string => !!p)
      for (const p of linkLogos) await removeImage(sb, 'home-section-link-logos', p)

      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-home-sections]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
