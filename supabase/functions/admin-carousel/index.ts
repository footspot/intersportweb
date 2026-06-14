// * admin-carousel — CRUD for the home page hero carousel. Admin only.
// * POST/PUT accept multipart/form-data (data + optional image file) or JSON.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { parseMultipart, uploadImage, removeImage } from '../_shared/multipart.ts'

const BUCKET = 'home-carousel'

// * Allowed entrance animations; anything else falls back to 'zoom'.
const ANIMATIONS = ['zoom', 'soccer', 'basketball']
function normalizeAnimation(v: unknown): string {
  const s = typeof v === 'string' ? v : ''
  return ANIMATIONS.includes(s) ? s : 'zoom'
}

// * Card kinds; anything else falls back to 'image'.
const KINDS = ['image', 'product']
function normalizeKind(v: unknown): string {
  const s = typeof v === 'string' ? v : ''
  return KINDS.includes(s) ? s : 'image'
}

interface SlideData {
  id?: string
  title?: string | null
  subtitle?: string | null
  sort_order?: number
  animation?: string
  card_kind?: string
  product_id?: string | null
  sport_id?: string | null
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
        ? await parseMultipart<SlideData>(req, 'image')
        : { data: (await req.json()) as SlideData, file: null as File | null }

      const kind = normalizeKind(data?.card_kind)
      // * Image cards must carry an image. Product cards may omit it and fall
      // * back to the linked product's primary image on the storefront.
      if (kind === 'image' && !file) {
        return jsonResponse({ error: 'image required' }, { status: 400 })
      }
      if (kind === 'product' && !data?.product_id) {
        return jsonResponse({ error: 'product required' }, { status: 400 })
      }

      const imagePath = file ? await uploadImage(sb, BUCKET, file) : null

      const { data: slide, error } = await sb
        .from('home_slides')
        .insert({
          image_path: imagePath,
          title: data?.title?.toString().trim() || null,
          subtitle: data?.subtitle?.toString().trim() || null,
          sort_order: data?.sort_order ?? 0,
          animation: normalizeAnimation(data?.animation),
          card_kind: kind,
          product_id: kind === 'product' ? data?.product_id ?? null : null,
          sport_id: kind === 'product' ? data?.sport_id ?? null : null,
        })
        .select()
        .single()
      if (error) {
        await removeImage(sb, BUCKET, imagePath)
        throw error
      }
      return jsonResponse({ slide }, { status: 201 })
    }

    if (req.method === 'PUT') {
      const { data, file } = isMultipart
        ? await parseMultipart<SlideData>(req, 'image')
        : { data: (await req.json()) as SlideData, file: null as File | null }

      if (!data?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: current, error: cErr } = await sb
        .from('home_slides')
        .select('image_path')
        .eq('id', data.id)
        .single()
      if (cErr) throw cErr
      const previousImage = current?.image_path ?? null

      const patch: Record<string, unknown> = {}
      if (data.title !== undefined) patch.title = data.title?.toString().trim() || null
      if (data.subtitle !== undefined) patch.subtitle = data.subtitle?.toString().trim() || null
      if (data.sort_order !== undefined) patch.sort_order = data.sort_order
      if (data.animation !== undefined) patch.animation = normalizeAnimation(data.animation)
      if (data.card_kind !== undefined) {
        const kind = normalizeKind(data.card_kind)
        patch.card_kind = kind
        // * Keep the product link consistent with the chosen kind.
        patch.product_id = kind === 'product' ? data.product_id ?? null : null
        patch.sport_id = kind === 'product' ? data.sport_id ?? null : null
      } else {
        if (data.product_id !== undefined) patch.product_id = data.product_id
        if (data.sport_id !== undefined) patch.sport_id = data.sport_id
      }

      let newImagePath: string | null = null
      if (file) {
        newImagePath = await uploadImage(sb, BUCKET, file)
        patch.image_path = newImagePath
      }

      const { data: slide, error } = await sb
        .from('home_slides')
        .update(patch)
        .eq('id', data.id)
        .select()
        .single()
      if (error) {
        if (newImagePath) await removeImage(sb, BUCKET, newImagePath)
        throw error
      }

      if (file && previousImage && previousImage !== newImagePath) {
        await removeImage(sb, BUCKET, previousImage)
      }

      return jsonResponse({ slide })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })
      const { data: current } = await sb.from('home_slides').select('image_path').eq('id', id).single()
      const { error } = await sb.from('home_slides').delete().eq('id', id)
      if (error) throw error
      if (current?.image_path) await removeImage(sb, BUCKET, current.image_path)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-carousel]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
