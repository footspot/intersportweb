// * admin-catalog — CRUD for public catalog links. Admin only.
// * POST/PUT accept multipart/form-data (data + optional logo file) or JSON.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { parseMultipart, uploadImage, removeImage } from '../_shared/multipart.ts'

const BUCKET = 'catalog-logos'

interface CatalogData {
  id?: string
  name?: string
  url?: string
  sort_order?: number
  clear_logo?: boolean
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
        ? await parseMultipart<CatalogData>(req, 'logo')
        : { data: (await req.json()) as CatalogData, file: null as File | null }

      if (!data?.name?.trim())
        return jsonResponse({ error: 'name required' }, { status: 400 })
      if (!data?.url?.trim()) return jsonResponse({ error: 'url required' }, { status: 400 })

      let logoPath: string | null = null
      if (file) logoPath = await uploadImage(sb, BUCKET, file)

      const { data: link, error } = await sb
        .from('catalog_links')
        .insert({
          name: data.name.trim(),
          url: data.url.trim(),
          logo_path: logoPath,
          sort_order: data.sort_order ?? 0,
        })
        .select()
        .single()
      if (error) {
        if (logoPath) await removeImage(sb, BUCKET, logoPath)
        throw error
      }
      return jsonResponse({ link }, { status: 201 })
    }

    if (req.method === 'PUT') {
      const { data, file } = isMultipart
        ? await parseMultipart<CatalogData>(req, 'logo')
        : { data: (await req.json()) as CatalogData, file: null as File | null }

      if (!data?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: current, error: cErr } = await sb
        .from('catalog_links')
        .select('logo_path')
        .eq('id', data.id)
        .single()
      if (cErr) throw cErr
      const previousLogo = current?.logo_path ?? null

      const patch: Record<string, unknown> = {}
      if (data.name !== undefined) patch.name = data.name.trim()
      if (data.url !== undefined) patch.url = data.url.trim()
      if (data.sort_order !== undefined) patch.sort_order = data.sort_order

      let newLogoPath: string | null = null
      if (file) {
        newLogoPath = await uploadImage(sb, BUCKET, file)
        patch.logo_path = newLogoPath
      } else if (data.clear_logo) {
        patch.logo_path = null
      }

      const { data: link, error } = await sb
        .from('catalog_links')
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

      return jsonResponse({ link })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })
      const { data: current } = await sb.from('catalog_links').select('logo_path').eq('id', id).single()
      const { error } = await sb.from('catalog_links').delete().eq('id', id)
      if (error) throw error
      if (current?.logo_path) await removeImage(sb, BUCKET, current.logo_path)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-catalog]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
