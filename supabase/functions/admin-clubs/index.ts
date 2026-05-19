// * admin-clubs — CRUD for clubs. Admin only.
// *
// * POST/PUT accept multipart/form-data:
// *   - data: JSON { sport_id, name, is_password_protected?, password?, sort_order?, clear_logo? } (+ id for PUT)
// *   - logo: optional File (club logo)
// *
// * JSON body is still accepted for the `/reset-password` sub-action and DELETE.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { parseMultipart, uploadImage, removeImage } from '../_shared/multipart.ts'
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts'

const BUCKET = 'club-logos'

interface ClubData {
  id?: string
  sport_id?: string
  name?: string
  is_password_protected?: boolean
  password?: string | null
  sort_order?: number
  clear_logo?: boolean
  accent_color?: string | null
  slogan?: string | null
}

interface ResetPasswordPayload {
  id: string
  password: string | null
}

// * Sync variants avoid Web Workers, which Supabase Edge Functions don't support.
function hashPassword(plain: string): string {
  const salt = bcrypt.genSaltSync(10)
  return bcrypt.hashSync(plain, salt)
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
    if (req.method === 'POST' && action === 'reset-password') {
      const body = (await req.json()) as ResetPasswordPayload
      if (!body?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      if (body.password === null) {
        const { error } = await sb
          .from('clubs')
          .update({ is_password_protected: false, access_password_hash: null })
          .eq('id', body.id)
        if (error) throw error
        return jsonResponse({ ok: true })
      }
      if (!body.password || body.password.length < 4) {
        return jsonResponse({ error: 'password must be at least 4 characters' }, { status: 400 })
      }
      const hash = hashPassword(body.password)
      const { error } = await sb
        .from('clubs')
        .update({ is_password_protected: true, access_password_hash: hash })
        .eq('id', body.id)
      if (error) throw error
      return jsonResponse({ ok: true })
    }

    if (req.method === 'POST') {
      const { data, file } = isMultipart
        ? await parseMultipart<ClubData>(req, 'logo')
        : { data: (await req.json()) as ClubData, file: null as File | null }

      if (!data?.sport_id) return jsonResponse({ error: 'sport_id required' }, { status: 400 })
      if (!data?.name?.trim()) return jsonResponse({ error: 'name required' }, { status: 400 })

      let logoPath: string | null = null
      if (file) logoPath = await uploadImage(sb, BUCKET, file)

      const insert: Record<string, unknown> = {
        sport_id: data.sport_id,
        name: data.name.trim(),
        logo_path: logoPath,
        sort_order: data.sort_order ?? 0,
        is_password_protected: !!data.is_password_protected,
        accent_color: data.accent_color ?? null,
        slogan: data.slogan?.trim() || null,
      }
      if (data.is_password_protected) {
        if (!data.password) {
          if (logoPath) await removeImage(sb, BUCKET, logoPath)
          return jsonResponse({ error: 'password required when protected' }, { status: 400 })
        }
        insert.access_password_hash = hashPassword(data.password)
      }

      const { data: club, error } = await sb.from('clubs').insert(insert).select().single()
      if (error) {
        if (logoPath) await removeImage(sb, BUCKET, logoPath)
        throw error
      }
      return jsonResponse({ club }, { status: 201 })
    }

    if (req.method === 'PUT') {
      const { data, file } = isMultipart
        ? await parseMultipart<ClubData>(req, 'logo')
        : { data: (await req.json()) as ClubData, file: null as File | null }

      if (!data?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: current, error: cErr } = await sb
        .from('clubs')
        .select('logo_path')
        .eq('id', data.id)
        .single()
      if (cErr) throw cErr
      const previousLogo = current?.logo_path ?? null

      const patch: Record<string, unknown> = {}
      if (data.sport_id) patch.sport_id = data.sport_id
      if (data.name !== undefined) patch.name = data.name.trim()
      if (data.sort_order !== undefined) patch.sort_order = data.sort_order

      let newLogoPath: string | null = null
      if (file) {
        newLogoPath = await uploadImage(sb, BUCKET, file)
        patch.logo_path = newLogoPath
      } else if (data.clear_logo) {
        patch.logo_path = null
      }

      if (data.is_password_protected === true) {
        patch.is_password_protected = true
        if (data.password) patch.access_password_hash = hashPassword(data.password)
      } else if (data.is_password_protected === false) {
        patch.is_password_protected = false
        patch.access_password_hash = null
      }

      if ('accent_color' in data) patch.accent_color = data.accent_color ?? null
      if ('slogan' in data) patch.slogan = data.slogan?.trim() || null

      const { data: club, error } = await sb
        .from('clubs')
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

      return jsonResponse({ club })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { count, error: countErr } = await sb
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', id)
      if (countErr) throw countErr
      if ((count ?? 0) > 0) {
        return jsonResponse({ error: 'club_has_products', product_count: count }, { status: 409 })
      }

      const { data: current } = await sb.from('clubs').select('logo_path').eq('id', id).single()

      const { error } = await sb.from('clubs').delete().eq('id', id)
      if (error) throw error

      if (current?.logo_path) await removeImage(sb, BUCKET, current.logo_path)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-clubs]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
