// * admin-size-guides — CRUD for brand size-guide files. Admin only.
// *
// * POST/PUT accept multipart/form-data:
// *   - data: JSON { name } (+ id for PUT)
// *   - file: the size-guide file (image or PDF). Required on POST; on PUT it
// *     replaces the stored file when present.
// *
// * Upload + DB write happen together. If either step fails, the other is rolled
// * back so the bucket never accumulates orphaned files. DELETE takes ?id and
// * drops the row (cascading product_size_guides links) + the storage file.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { parseMultipart, uploadImage, removeImage } from '../_shared/multipart.ts'

const BUCKET = 'size-guides'

interface SizeGuideData {
  id?: string
  name?: string
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
        ? await parseMultipart<SizeGuideData>(req, 'file')
        : { data: (await req.json()) as SizeGuideData, file: null as File | null }

      const name = (data?.name ?? '').trim()
      if (!name) return jsonResponse({ error: 'name required' }, { status: 400 })
      if (!file) return jsonResponse({ error: 'file required' }, { status: 400 })

      const filePath = await uploadImage(sb, BUCKET, file)

      const { data: guide, error } = await sb
        .from('size_guides')
        .insert({ name, file_path: filePath, file_type: file.type || null })
        .select()
        .single()
      if (error) {
        // * Roll back the upload if the DB write failed.
        await removeImage(sb, BUCKET, filePath)
        throw error
      }
      return jsonResponse({ guide }, { status: 201 })
    }

    if (req.method === 'PUT') {
      const { data, file } = isMultipart
        ? await parseMultipart<SizeGuideData>(req, 'file')
        : { data: (await req.json()) as SizeGuideData, file: null as File | null }

      if (!data?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      // * Fetch the current file so we can delete it after a successful replace.
      const { data: current, error: cErr } = await sb
        .from('size_guides')
        .select('file_path')
        .eq('id', data.id)
        .single()
      if (cErr) throw cErr
      const previousFile = current?.file_path ?? null

      const patch: Record<string, unknown> = {}
      if (typeof data.name === 'string' && data.name.trim()) patch.name = data.name.trim()

      let newFilePath: string | null = null
      if (file) {
        newFilePath = await uploadImage(sb, BUCKET, file)
        patch.file_path = newFilePath
        patch.file_type = file.type || null
      }

      const { data: guide, error } = await sb
        .from('size_guides')
        .update(patch)
        .eq('id', data.id)
        .select()
        .single()
      if (error) {
        if (newFilePath) await removeImage(sb, BUCKET, newFilePath)
        throw error
      }

      // * On success, delete the old file if it was replaced.
      if (newFilePath && previousFile && previousFile !== newFilePath) {
        await removeImage(sb, BUCKET, previousFile)
      }

      return jsonResponse({ guide })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })

      // * Read file_path so we can delete the storage file after the row is gone
      // * (product_size_guides links cascade automatically).
      const { data: current } = await sb.from('size_guides').select('file_path').eq('id', id).single()

      const { error } = await sb.from('size_guides').delete().eq('id', id)
      if (error) throw error

      if (current?.file_path) await removeImage(sb, BUCKET, current.file_path)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-size-guides]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
