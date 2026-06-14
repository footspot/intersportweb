// * admin-hero-media — CRUD for the full-bleed hero background carousel
// * (images + videos). Admin only. POST accepts multipart/form-data (data JSON
// * part + file part); PUT (reorder) and DELETE accept JSON / query.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { parseMultipart, uploadImage, removeImage } from '../_shared/multipart.ts'

const BUCKET = 'home-carousel'

const KINDS = ['image', 'video']
function normalizeKind(v: unknown, fallback = 'image'): string {
  const s = typeof v === 'string' ? v : ''
  return KINDS.includes(s) ? s : fallback
}

interface MediaData {
  id?: string
  media_kind?: string
  sort_order?: number
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
        ? await parseMultipart<MediaData>(req, 'file')
        : { data: (await req.json()) as MediaData, file: null as File | null }

      if (!file) return jsonResponse({ error: 'file required' }, { status: 400 })

      // * Trust the file's MIME first, fall back to the declared kind.
      const kind = file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('image/')
          ? 'image'
          : normalizeKind(data?.media_kind)

      const mediaPath = await uploadImage(sb, BUCKET, file)

      const { data: item, error } = await sb
        .from('hero_banner_media')
        .insert({
          media_kind: kind,
          media_path: mediaPath,
          sort_order: data?.sort_order ?? 0,
        })
        .select()
        .single()
      if (error) {
        await removeImage(sb, BUCKET, mediaPath)
        throw error
      }
      return jsonResponse({ item }, { status: 201 })
    }

    if (req.method === 'PUT') {
      // * Reorder only — sort_order updates.
      const data = (await req.json()) as MediaData
      if (!data?.id) return jsonResponse({ error: 'id required' }, { status: 400 })
      const patch: Record<string, unknown> = {}
      if (data.sort_order !== undefined) patch.sort_order = data.sort_order
      const { data: item, error } = await sb
        .from('hero_banner_media')
        .update(patch)
        .eq('id', data.id)
        .select()
        .single()
      if (error) throw error
      return jsonResponse({ item })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })
      const { data: current } = await sb
        .from('hero_banner_media')
        .select('media_path')
        .eq('id', id)
        .single()
      const { error } = await sb.from('hero_banner_media').delete().eq('id', id)
      if (error) throw error
      if (current?.media_path) await removeImage(sb, BUCKET, current.media_path)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-hero-media]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
