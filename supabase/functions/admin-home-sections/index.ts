// * admin-home-sections — CRUD for the dynamic entry-row sections shown on
// * slide 0 of the home carousel. Each section now holds multiple URL links
// * (managed via admin-home-section-links). Admin only.
// * POST/PUT accept multipart/form-data (data + optional logo file) or JSON.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { parseMultipart, uploadImage, removeImage } from '../_shared/multipart.ts'

const BUCKET = 'home-section-logos'

interface SectionData {
  id?: string
  name?: string
  description?: string | null
  accent_color?: string
  is_visible?: boolean
  sort_order?: number
  clear_logo?: boolean
}

function normalizeColor(value: string | undefined, fallback = '#0331f9'): string {
  if (!value) return fallback
  const v = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback
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
      const { data, file } = isMultipart
        ? await parseMultipart<SectionData>(req, 'logo')
        : { data: (await req.json()) as SectionData, file: null as File | null }

      if (!data?.name?.trim())
        return jsonResponse({ error: 'name required' }, { status: 400 })

      let logoPath: string | null = null
      if (file) logoPath = await uploadImage(sb, BUCKET, file)

      const { data: section, error } = await sb
        .from('home_sections')
        .insert({
          name: data.name.trim(),
          description: data.description?.toString().trim() || null,
          logo_path: logoPath,
          accent_color: normalizeColor(data.accent_color),
          is_visible: data.is_visible ?? true,
          sort_order: data.sort_order ?? 0,
        })
        .select()
        .single()
      if (error) {
        if (logoPath) await removeImage(sb, BUCKET, logoPath)
        throw error
      }
      return jsonResponse({ section }, { status: 201 })
    }

    if (req.method === 'PUT') {
      const { data, file } = isMultipart
        ? await parseMultipart<SectionData>(req, 'logo')
        : { data: (await req.json()) as SectionData, file: null as File | null }

      if (!data?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: current, error: cErr } = await sb
        .from('home_sections')
        .select('logo_path')
        .eq('id', data.id)
        .single()
      if (cErr) throw cErr
      const previousLogo = current?.logo_path ?? null

      const patch: Record<string, unknown> = {}
      if (data.name !== undefined) patch.name = data.name.trim()
      if (data.description !== undefined)
        patch.description = data.description?.toString().trim() || null
      if (data.accent_color !== undefined)
        patch.accent_color = normalizeColor(data.accent_color)
      if (data.is_visible !== undefined) patch.is_visible = !!data.is_visible
      if (data.sort_order !== undefined) patch.sort_order = data.sort_order

      let newLogoPath: string | null = null
      if (file) {
        newLogoPath = await uploadImage(sb, BUCKET, file)
        patch.logo_path = newLogoPath
      } else if (data.clear_logo) {
        patch.logo_path = null
      }

      const { data: section, error } = await sb
        .from('home_sections')
        .update(patch)
        .eq('id', data.id)
        .select()
        .single()
      if (error) {
        if (newLogoPath) await removeImage(sb, BUCKET, newLogoPath)
        throw error
      }

      if ((file || data.clear_logo) && previousLogo && previousLogo !== newLogoPath) {
        await removeImage(sb, BUCKET, previousLogo)
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
        .select('logo_path')
        .eq('id', id)
        .single()

      const { error } = await sb.from('home_sections').delete().eq('id', id)
      if (error) throw error

      if (current?.logo_path) await removeImage(sb, BUCKET, current.logo_path)
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
