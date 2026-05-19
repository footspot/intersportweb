// * Helpers for edge functions that take multipart/form-data with a JSON
// * `data` field + an optional image file.
// * On Supabase Storage: uploaded via the service-role client, so RLS on
// * storage.objects doesn't apply — uploads always succeed regardless of the
// * caller's role (the caller's role has already been verified by the function).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface ParsedMultipart<T = any> {
  data: T                   // * parsed JSON from the `data` field
  file: File | null         // * optional uploaded file; null if none present
}

/** * Reads a FormData body. Expects a JSON-encoded `data` field and an optional file. */
export async function parseMultipart<T = any>(req: Request, fileField = 'image'): Promise<ParsedMultipart<T>> {
  const form = await req.formData()
  const dataStr = form.get('data')
  if (typeof dataStr !== 'string') throw new Error('data field required')
  const data = JSON.parse(dataStr) as T
  const raw = form.get(fileField)
  const file = raw instanceof File ? raw : null
  return { data, file }
}

export interface ParsedMultipartFiles<T = any> {
  data: T                                 // * parsed JSON from the `data` field
  files: Record<string, File>             // * every File-valued field, keyed by field name
}

/**
 * * Reads a FormData body with a JSON-encoded `data` field and any number of
 * * arbitrarily-keyed file fields. Non-File fields other than `data` are ignored.
 */
export async function parseMultipartFiles<T = any>(req: Request): Promise<ParsedMultipartFiles<T>> {
  const form = await req.formData()
  const dataStr = form.get('data')
  if (typeof dataStr !== 'string') throw new Error('data field required')
  const data = JSON.parse(dataStr) as T
  const files: Record<string, File> = {}
  for (const [key, value] of form.entries()) {
    if (key === 'data') continue
    if (value instanceof File) files[key] = value
  }
  return { data, files }
}

/**
 * * Upload a File to the given bucket and return the storage path.
 * * Caller is responsible for the filename policy (we use `<uuid>.<ext>` here).
 */
export async function uploadImage(
  sb: SupabaseClient,
  bucket: string,
  file: File,
): Promise<string> {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await sb.storage.from(bucket).upload(path, file, {
    contentType: file.type || undefined,
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  return path
}

/** * Silently remove a storage file (used when a row is deleted or its image replaced). */
export async function removeImage(
  sb: SupabaseClient,
  bucket: string,
  path: string | null | undefined,
): Promise<void> {
  if (!path) return
  await sb.storage.from(bucket).remove([path]).catch((err) => {
    console.error(`[removeImage] ${bucket}/${path}`, err)
  })
}
