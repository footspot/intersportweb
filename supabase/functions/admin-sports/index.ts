// * admin-sports — CRUD for sports. Admin only.
// *
// * POST/PUT accept multipart/form-data:
// *   - data: JSON { name: { fr, en }, sort_order?, clear_icon? }  (+ id for PUT)
// *   - icon: optional File (sport icon)
// *
// * Upload + DB write happen together. If either step fails, the other is rolled
// * back so the bucket never accumulates orphaned files.
//
// * JSON body is still accepted for the `/reorder` sub-action and for DELETE.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { parseMultipart, uploadImage, removeImage } from '../_shared/multipart.ts'

const BUCKET = 'sports-icons'

// * A valid 6-digit hex color, or null (the tile then uses its default styling).
function colorOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim()
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null
}

interface SportData {
  id?: string
  name?: { fr: string; en: string }
  sort_order?: number
  // * When true, detach the existing icon even if no new file is provided.
  clear_icon?: boolean
  // * Optional storefront tile background (hex) or null to clear it.
  background_color?: string | null
}

interface ReorderPayload {
  order: Array<{ id: string; sort_order: number }>
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const guard = await verifyAdmin(req)
  if (guard instanceof Response) return guard

  const sb = serviceClient()
  const url = new URL(req.url)
  const action = url.pathname.split('/').filter(Boolean)[1] ?? ''
  const contentType = req.headers.get('content-type') ?? ''
  const isMultipart = contentType.startsWith('multipart/form-data')

  try {
    // * Reorder takes JSON only
    if (req.method === 'POST' && action === 'reorder') {
      const body = (await req.json()) as ReorderPayload
      if (!Array.isArray(body?.order)) return jsonResponse({ error: 'Invalid order payload' }, { status: 400 })
      const updates = body.order.map(({ id, sort_order }) =>
        sb.from('sports').update({ sort_order }).eq('id', id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
      return jsonResponse({ ok: true })
    }

    if (req.method === 'POST') {
      const { data, file } = isMultipart
        ? await parseMultipart<SportData>(req, 'icon')
        : { data: (await req.json()) as SportData, file: null as File | null }

      if (!data?.name?.fr || !data?.name?.en) {
        return jsonResponse({ error: 'name.fr and name.en required' }, { status: 400 })
      }

      let iconPath: string | null = null
      if (file) iconPath = await uploadImage(sb, BUCKET, file)

      const { data: sport, error } = await sb
        .from('sports')
        .insert({
          name: data.name,
          icon_path: iconPath,
          background_color: colorOrNull(data.background_color),
          sort_order: data.sort_order ?? 0,
        })
        .select()
        .single()
      if (error) {
        // * Roll back the upload if the DB write failed
        if (iconPath) await removeImage(sb, BUCKET, iconPath)
        throw error
      }
      return jsonResponse({ sport }, { status: 201 })
    }

    if (req.method === 'PUT') {
      const { data, file } = isMultipart
        ? await parseMultipart<SportData>(req, 'icon')
        : { data: (await req.json()) as SportData, file: null as File | null }

      if (!data?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      // * Fetch the current icon so we can delete it after a successful replace
      const { data: current, error: cErr } = await sb
        .from('sports')
        .select('icon_path')
        .eq('id', data.id)
        .single()
      if (cErr) throw cErr
      const previousIcon = current?.icon_path ?? null

      const patch: Record<string, unknown> = {}
      if (data.name) patch.name = data.name
      if (data.sort_order !== undefined) patch.sort_order = data.sort_order
      // * Present (even as null) → set/clear; omitted → leave untouched.
      if ('background_color' in data) patch.background_color = colorOrNull(data.background_color)

      let newIconPath: string | null = null
      if (file) {
        newIconPath = await uploadImage(sb, BUCKET, file)
        patch.icon_path = newIconPath
      } else if (data.clear_icon) {
        patch.icon_path = null
      }

      const { data: sport, error } = await sb
        .from('sports')
        .update(patch)
        .eq('id', data.id)
        .select()
        .single()
      if (error) {
        if (newIconPath) await removeImage(sb, BUCKET, newIconPath)
        throw error
      }

      // * On success, delete the old icon if it was replaced or explicitly cleared
      if ((file || data.clear_icon) && previousIcon && previousIcon !== newIconPath) {
        await removeImage(sb, BUCKET, previousIcon)
      }

      return jsonResponse({ sport })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { count, error: countErr } = await sb
        .from('clubs')
        .select('*', { count: 'exact', head: true })
        .eq('sport_id', id)
      if (countErr) throw countErr
      if ((count ?? 0) > 0) {
        return jsonResponse({ error: 'sport_has_clubs', club_count: count }, { status: 409 })
      }

      // * Read icon_path so we can delete the storage file after the DB row is gone
      const { data: current } = await sb.from('sports').select('icon_path').eq('id', id).single()

      const { error } = await sb.from('sports').delete().eq('id', id)
      if (error) throw error

      if (current?.icon_path) await removeImage(sb, BUCKET, current.icon_path)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-sports]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
