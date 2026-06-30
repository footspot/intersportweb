// * backoffice-products — CRUD for products, variants, and bundle composition.
// * Admin OR employee.
// *
// * POST/PUT body (JSON or multipart with `data` field):
// *   Regular product:
// *     { ...productFields, variants: [...], image_slots: [...] }
// *   Bundle product (is_pack: true):
// *     { ...productFields, is_pack: true, components: [...], image_slots: [...] }
// *     — variants MUST be empty for bundles; bundle stock is derived from components.
// *
// * Images: `image_slots` is an ordered list (position 0 = primary, max 5).
// * Each slot is either `{ existing: "<path>" }` to keep a pre-existing image,
// * or `{ file_key: "<key>" }` to upload the file attached under that key in
// * the multipart form.
// *
// * Emits `product_locked_into_bundle` / `product_released_from_bundle` notifications
// * via `notify_backoffice` RPC on the component set delta.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyBackoffice } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { validatePricing, type DiscountSource } from '../_shared/pricing.ts'
import { parseMultipartFiles, uploadImage, removeImage } from '../_shared/multipart.ts'

const BUCKET = 'product-images'
const MAX_IMAGES = 10

type FlockingKind = 'none' | 'members' | 'supporters'
type BundleAxis = 'primary' | 'secondary' | 'product' | 'unique'

interface VariantPayload {
  id?: string
  size: string
  stock: number
  sku?: string | null
  footspot_size?: string | null
  // * References a color in `colors[]` by its client `key` (null = no color).
  color_key?: string | null
}

// * A color variant. New colors carry only a client `key`; existing ones also
// * carry their DB `id`. Variants and images reference colors by `key`.
interface ColorPayload {
  id?: string
  key: string
  name: string
  hex: string
}

interface BundleComponentPayload {
  component_product_id: string
  axis: BundleAxis
  quantity?: number
}

interface OptionPayload {
  name: string
  price?: number
  // * When true the storefront shows an optional free-text input for this
  // * option; `input_label` is the prompt next to it.
  allow_custom_input?: boolean
  input_label?: string | null
}

interface ImageSlot {
  existing?: string
  file_key?: string
  // * References a color in `colors[]` by its client `key` (null = every color).
  color_key?: string | null
}

interface ProductData {
  id?: string
  club_id: string
  name: { fr: string; en: string }
  reference: string
  details?: { fr?: string; en?: string } | null
  category?: string | null
  buying_price: number
  selling_price: number
  discount_percent?: number
  discount_source?: DiscountSource
  flocking_kind?: FlockingKind
  flocking_members_name_price?: number
  flocking_members_initials_price?: number
  flocking_supporter_price?: number
  is_pack?: boolean
  is_visible?: boolean
  is_on_clearance?: boolean
  weight_grams?: number
  available_from?: string | null
  footspot_category?: string | null
  sort_order?: number
  variants?: VariantPayload[]
  components?: BundleComponentPayload[]
  options?: OptionPayload[]
  colors?: ColorPayload[]
  image_slots?: ImageSlot[]
  // * Ids of size guides assigned to this product (many-to-many). Optional on
  // * PUT: omit to leave the set untouched, pass [] to clear it.
  size_guide_ids?: string[]
}

const PRODUCT_SELECT =
  '*, variants:product_variants(*), bundle_components!bundle_components_bundle_product_id_fkey(*), images:product_images(id, image_path, position, color_id), options:product_options(id, name, price, position, allow_custom_input, input_label), colors:product_colors(id, name, hex, position), size_guide_links:product_size_guides(position, guide:size_guides(id, name, file_path, file_type))'

function normaliseVariants(vs: VariantPayload[] | undefined): VariantPayload[] | string {
  if (!Array.isArray(vs) || vs.length === 0) return 'at least one variant is required'
  // * Size is unique per color, so dedupe on (color_key, size) rather than size.
  const seen = new Set<string>()
  for (const v of vs) {
    if (!v?.size?.trim()) return 'variant size cannot be empty'
    const key = `${v.color_key ?? ''}::${v.size.trim().toLowerCase()}`
    if (seen.has(key)) return `duplicate size: ${v.size.trim()}`
    seen.add(key)
    if (!Number.isFinite(v.stock) || v.stock < 0) return 'variant stock must be >= 0'
  }
  return vs.map((v) => ({
    id: v.id,
    size: v.size.trim(),
    stock: Math.floor(Number(v.stock)),
    sku: v.sku?.trim() || null,
    footspot_size: v.footspot_size && v.footspot_size.trim() !== '' ? v.footspot_size.trim() : null,
    color_key: v.color_key && v.color_key.trim() !== '' ? v.color_key.trim() : null,
  }))
}

// * Validate the color variants. Returns the cleaned list (possibly empty) or
// * an error string. Colors are optional, so undefined/null → [].
function normaliseColors(cs: ColorPayload[] | undefined | null): ColorPayload[] | string {
  if (cs === undefined || cs === null) return []
  if (!Array.isArray(cs)) return 'colors must be an array'
  const seenKey = new Set<string>()
  const seenName = new Set<string>()
  const out: ColorPayload[] = []
  for (const c of cs) {
    if (!c?.key || typeof c.key !== 'string') return 'color key required'
    if (seenKey.has(c.key)) return `duplicate color key: ${c.key}`
    seenKey.add(c.key)
    const name = (c.name ?? '').trim()
    if (!name) return 'color name cannot be empty'
    if (seenName.has(name.toLowerCase())) return `duplicate color: ${name}`
    seenName.add(name.toLowerCase())
    const hex = (c.hex ?? '').trim()
    if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return `invalid color hex: ${hex}`
    out.push({ id: c.id, key: c.key, name, hex })
  }
  return out
}

// * Ensure every color reference (from variants/images) points at a defined
// * color key. Returns an error string or null.
function colorRefError(refs: (string | null | undefined)[], definedKeys: Set<string>): string | null {
  for (const r of refs) {
    if (r && !definedKeys.has(r)) return `unknown color reference: ${r}`
  }
  return null
}

function normaliseComponents(
  cs: BundleComponentPayload[] | undefined,
): BundleComponentPayload[] | string {
  if (!Array.isArray(cs) || cs.length === 0) return 'bundle requires at least one component'
  const seen = new Set<string>()
  const AXES = ['primary', 'secondary', 'product', 'unique']
  let hasPrimary = false
  for (const c of cs) {
    if (!c?.component_product_id) return 'component_product_id required'
    if (!AXES.includes(c.axis)) return 'axis must be primary, secondary, product or unique'
    if (seen.has(c.component_product_id)) return `duplicate component: ${c.component_product_id}`
    seen.add(c.component_product_id)
    if (c.axis === 'primary') hasPrimary = true
    const q = Number(c.quantity ?? 1)
    if (!Number.isFinite(q) || q < 1) return 'component quantity must be >= 1'
  }
  if (!hasPrimary) return 'at least one component must use the primary axis'
  return cs.map((c) => ({
    component_product_id: c.component_product_id,
    axis: c.axis,
    quantity: Math.max(1, Math.floor(Number(c.quantity ?? 1))),
  }))
}

// * Validate the paid add-on options. Returns the cleaned list (possibly
// * empty) or an error string. Options are optional, so undefined/null → [].
function normaliseOptions(os: OptionPayload[] | undefined | null): OptionPayload[] | string {
  if (os === undefined || os === null) return []
  if (!Array.isArray(os)) return 'options must be an array'
  const out: OptionPayload[] = []
  for (const o of os) {
    if (!o?.name?.trim()) return 'option name cannot be empty'
    const price = Number(o.price ?? 0)
    if (!Number.isFinite(price) || price < 0) return 'option price must be >= 0'
    const allowInput = !!o.allow_custom_input
    // * Keep the input label only when the input is enabled.
    const inputLabel = allowInput ? (o.input_label?.trim() || null) : null
    out.push({ name: o.name.trim(), price: Math.max(0, price), allow_custom_input: allowInput, input_label: inputLabel })
  }
  return out
}

// * Validate image_slots shape; returns the cleaned list or an error string.
function normaliseSlots(
  slots: ImageSlot[] | undefined,
  files: Record<string, File>,
): ImageSlot[] | string {
  if (slots === undefined || slots === null) return []
  if (!Array.isArray(slots)) return 'image_slots must be an array'
  if (slots.length > MAX_IMAGES) return `at most ${MAX_IMAGES} images per product`
  const seenExisting = new Set<string>()
  const seenFile = new Set<string>()
  const out: ImageSlot[] = []
  for (const s of slots) {
    const hasExisting = typeof s?.existing === 'string' && s.existing.length > 0
    const hasFile = typeof s?.file_key === 'string' && s.file_key.length > 0
    if (hasExisting && hasFile) return 'slot cannot have both existing and file_key'
    if (!hasExisting && !hasFile) return 'slot must have either existing or file_key'
    const color_key = s.color_key && s.color_key.trim() !== '' ? s.color_key.trim() : null
    if (hasExisting) {
      if (seenExisting.has(s.existing!)) return 'duplicate existing image path'
      seenExisting.add(s.existing!)
      out.push({ existing: s.existing, color_key })
    } else {
      if (seenFile.has(s.file_key!)) return 'duplicate file_key'
      seenFile.add(s.file_key!)
      if (!(s.file_key! in files)) return `missing file for slot: ${s.file_key}`
      out.push({ file_key: s.file_key, color_key })
    }
  }
  return out
}

// * An image ready for the DB: its final storage path + the color it belongs to.
interface ResolvedImage {
  image_path: string
  color_key: string | null
}

// * Upload each new file, returning the final ordered image list (path +
// * color_key) + any paths actually uploaded (so we can clean up on failure).
async function applySlotsToStorage(
  sb: ReturnType<typeof serviceClient>,
  slots: ImageSlot[],
  files: Record<string, File>,
): Promise<{ items: ResolvedImage[]; uploaded: string[] }> {
  const items: ResolvedImage[] = []
  const uploaded: string[] = []
  for (const s of slots) {
    if (s.existing) {
      items.push({ image_path: s.existing, color_key: s.color_key ?? null })
    } else {
      const path = await uploadImage(sb, BUCKET, files[s.file_key!])
      uploaded.push(path)
      items.push({ image_path: path, color_key: s.color_key ?? null })
    }
  }
  return { items, uploaded }
}

async function replaceProductImages(
  sb: ReturnType<typeof serviceClient>,
  productId: string,
  items: ResolvedImage[],
  keyToId: Map<string, string>,
) {
  const { error: dErr } = await sb.from('product_images').delete().eq('product_id', productId)
  if (dErr) throw dErr
  if (items.length === 0) return
  const rows = items.map((it, position) => ({
    product_id: productId,
    image_path: it.image_path,
    position,
    color_id: it.color_key ? keyToId.get(it.color_key) ?? null : null,
  }))
  const { error: iErr } = await sb.from('product_images').insert(rows)
  if (iErr) throw iErr
}

// * Replace the product's whole option set (delete-all + reinsert), mirroring
// * how images are handled. Options carry no storage so this is pure DB.
async function replaceProductOptions(
  sb: ReturnType<typeof serviceClient>,
  productId: string,
  options: OptionPayload[],
) {
  const { error: dErr } = await sb.from('product_options').delete().eq('product_id', productId)
  if (dErr) throw dErr
  if (options.length === 0) return
  const rows = options.map((o, position) => ({
    product_id: productId,
    name: o.name,
    price: o.price ?? 0,
    position,
    allow_custom_input: !!o.allow_custom_input,
    input_label: o.allow_custom_input ? (o.input_label ?? null) : null,
  }))
  const { error: iErr } = await sb.from('product_options').insert(rows)
  if (iErr) throw iErr
}

async function cleanupUploads(
  sb: ReturnType<typeof serviceClient>,
  paths: string[],
): Promise<void> {
  for (const p of paths) await removeImage(sb, BUCKET, p)
}

// * Dedupe a list of size-guide ids, dropping blanks. Existence isn't checked
// * here — a stale id just fails the FK insert and rolls the save back.
function normaliseSizeGuideIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (typeof id === 'string' && id.trim() && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out
}

// * Replace the product's whole size-guide link set (delete-all + reinsert),
// * mirroring how options are handled. Order is preserved via `position`.
async function replaceProductSizeGuides(
  sb: ReturnType<typeof serviceClient>,
  productId: string,
  ids: string[],
) {
  const { error: dErr } = await sb.from('product_size_guides').delete().eq('product_id', productId)
  if (dErr) throw dErr
  if (ids.length === 0) return
  const rows = ids.map((size_guide_id, position) => ({ product_id: productId, size_guide_id, position }))
  const { error: iErr } = await sb.from('product_size_guides').insert(rows)
  if (iErr) throw iErr
}

// * Upsert the product's colors (diff by id) and return a map from each payload
// * `key` to its resolved DB id. Colors absent from the payload are deleted —
// * cascade-removing their size variants and nulling their image links. Pass an
// * empty list to clear all colors (e.g. when a product becomes a pack).
async function resolveColors(
  sb: ReturnType<typeof serviceClient>,
  productId: string,
  colors: ColorPayload[],
): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>()
  const keepIds = new Set<string>()
  for (const [i, c] of colors.entries()) {
    if (c.id) {
      const { error } = await sb
        .from('product_colors')
        .update({ name: c.name, hex: c.hex, position: i })
        .eq('id', c.id)
        .eq('product_id', productId)
      if (error) throw error
      keyToId.set(c.key, c.id)
      keepIds.add(c.id)
    } else {
      const { data: ins, error } = await sb
        .from('product_colors')
        .insert({ product_id: productId, name: c.name, hex: c.hex, position: i })
        .select('id')
        .single()
      if (error) throw error
      keyToId.set(c.key, ins.id)
      keepIds.add(ins.id)
    }
  }
  const { data: existing } = await sb
    .from('product_colors')
    .select('id')
    .eq('product_id', productId)
  const toDelete = (existing ?? []).map((r: any) => r.id).filter((id: string) => !keepIds.has(id))
  if (toDelete.length > 0) {
    const { error } = await sb.from('product_colors').delete().in('id', toDelete)
    if (error) throw error
  }
  return keyToId
}

function productRow(body: ProductData) {
  const pct = Number(body.discount_percent ?? 0)
  const source: DiscountSource = pct > 0 ? body.discount_source ?? null : null
  const kind: FlockingKind = body.flocking_kind ?? 'none'
  const isPack = !!body.is_pack
  return {
    club_id: body.club_id,
    name: body.name,
    reference: body.reference.trim(),
    details: body.details ?? null,
    category: body.category?.trim() || null,
    buying_price: Number(body.buying_price),
    selling_price: Number(body.selling_price),
    discount_percent: pct,
    discount_source: source,
    flocking_kind: kind,
    flocking_members_name_price:
      kind === 'members' ? Math.max(0, Number(body.flocking_members_name_price ?? 0)) : 0,
    flocking_members_initials_price:
      kind === 'members' ? Math.max(0, Number(body.flocking_members_initials_price ?? 0)) : 0,
    flocking_supporter_price:
      kind === 'supporters' ? Math.max(0, Number(body.flocking_supporter_price ?? 0)) : 0,
    is_pack: isPack,
    is_visible: body.is_visible ?? true,
    is_on_clearance: !!body.is_on_clearance,
    weight_grams: Math.max(0, Math.floor(Number(body.weight_grams ?? 0))),
    available_from: body.available_from && body.available_from.trim() !== '' ? body.available_from : null,
    footspot_category: body.footspot_category && body.footspot_category.trim() !== '' ? body.footspot_category : null,
    sort_order: body.sort_order ?? 0,
  }
}

// * Fetch each component's product details (for club-scope check + name). All
// * components must belong to the same club as the bundle itself.
async function loadComponentProducts(
  sb: ReturnType<typeof serviceClient>,
  ids: string[],
): Promise<{ id: string; club_id: string; is_pack: boolean; name: any; reference: string }[]> {
  if (ids.length === 0) return []
  const { data, error } = await sb
    .from('products')
    .select('id, club_id, is_pack, name, reference')
    .in('id', ids)
  if (error) throw error
  return (data ?? []) as any[]
}

// * Diffs component sets between previous and next, and emits notifications for
// * products newly locked (first time in any bundle) or newly released (no other
// * active bundle references them).
async function emitBundleLockNotifications(
  sb: ReturnType<typeof serviceClient>,
  bundleId: string,
  bundleName: string,
  clubId: string,
  previousIds: string[],
  nextIds: string[],
) {
  const toAdd = nextIds.filter((id) => !previousIds.includes(id))
  const toRemove = previousIds.filter((id) => !nextIds.includes(id))

  // * For added components: notify only if this is the product's FIRST bundle.
  if (toAdd.length > 0) {
    const { data: others } = await sb
      .from('bundle_components')
      .select('component_product_id, bundle_product_id')
      .in('component_product_id', toAdd)
      .neq('bundle_product_id', bundleId)
    const firstLock = toAdd.filter(
      (id) => !(others ?? []).some((o: any) => o.component_product_id === id),
    )
    if (firstLock.length > 0) {
      const { data: names } = await sb
        .from('products')
        .select('id, name')
        .in('id', firstLock)
      for (const p of names ?? []) {
        const productName = (p as any).name?.fr ?? (p as any).name?.en ?? ''
        await sb.rpc('notify_backoffice', {
          p_kind: 'product_locked_into_bundle',
          p_payload: {
            product_id: (p as any).id,
            product_name: productName,
            bundle_id: bundleId,
            bundle_name: bundleName,
            club_id: clubId,
          },
        })
      }
    }
  }

  // * For removed components: notify if they no longer belong to ANY bundle.
  if (toRemove.length > 0) {
    const { data: stillLinked } = await sb
      .from('bundle_components')
      .select('component_product_id')
      .in('component_product_id', toRemove)
    const linkedSet = new Set((stillLinked ?? []).map((r: any) => r.component_product_id))
    const released = toRemove.filter((id) => !linkedSet.has(id))
    if (released.length > 0) {
      const { data: names } = await sb
        .from('products')
        .select('id, name')
        .in('id', released)
      for (const p of names ?? []) {
        const productName = (p as any).name?.fr ?? (p as any).name?.en ?? ''
        await sb.rpc('notify_backoffice', {
          p_kind: 'product_released_from_bundle',
          p_payload: {
            product_id: (p as any).id,
            product_name: productName,
          },
        })
      }
    }
  }
}

// * Pick a reference that doesn't collide with an existing product (the column
// * is UNIQUE). Appends "-COPIE" then a counter until a free slot is found.
async function uniqueReference(
  sb: ReturnType<typeof serviceClient>,
  base: string,
): Promise<string> {
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? `${base}-COPIE` : `${base}-COPIE-${i}`
    const { data } = await sb.from('products').select('id').eq('reference', candidate).maybeSingle()
    if (!data) return candidate
  }
  // * Extremely unlikely fallback: random suffix.
  return `${base}-COPIE-${crypto.randomUUID().slice(0, 6)}`
}

// * Copy a stored gallery image to a fresh path, returning the new path.
async function copyStorageImage(
  sb: ReturnType<typeof serviceClient>,
  fromPath: string,
): Promise<string> {
  const ext = (fromPath.split('.').pop() || 'bin').toLowerCase()
  const toPath = `${crypto.randomUUID()}.${ext}`
  const { error } = await sb.storage.from(BUCKET).copy(fromPath, toPath)
  if (error) throw error
  return toPath
}

// * Deep-copy a product into a new hidden draft. Returns the full new product
// * row (PRODUCT_SELECT shape) or null if the source doesn't exist.
async function duplicateProduct(
  sb: ReturnType<typeof serviceClient>,
  sourceId: string,
): Promise<any | null> {
  const { data: src, error: sErr } = await sb
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', sourceId)
    .single()
  if (sErr || !src) return null

  // * 1. Product row — clone scalar fields, force hidden + unique reference.
  const reference = await uniqueReference(sb, (src as any).reference)
  const insertRow = {
    club_id: (src as any).club_id,
    name: (src as any).name,
    reference,
    details: (src as any).details ?? null,
    category: (src as any).category ?? null,
    buying_price: (src as any).buying_price,
    selling_price: (src as any).selling_price,
    discount_percent: (src as any).discount_percent ?? 0,
    discount_source: (src as any).discount_source ?? null,
    flocking_kind: (src as any).flocking_kind ?? 'none',
    flocking_members_name_price: (src as any).flocking_members_name_price ?? 0,
    flocking_members_initials_price: (src as any).flocking_members_initials_price ?? 0,
    flocking_supporter_price: (src as any).flocking_supporter_price ?? 0,
    is_pack: !!(src as any).is_pack,
    // * Always hidden so the admin can finish editing before publishing.
    is_visible: false,
    is_on_clearance: !!(src as any).is_on_clearance,
    weight_grams: (src as any).weight_grams ?? 0,
    available_from: (src as any).available_from ?? null,
    footspot_category: (src as any).footspot_category ?? null,
    sort_order: (src as any).sort_order ?? 0,
  }
  const { data: product, error: pErr } = await sb.from('products').insert(insertRow).select().single()
  if (pErr) throw pErr

  // * Track storage copies so we can clean them up if a later step fails.
  const copiedPaths: string[] = []
  try {
    // * 2. Colors — insert and build old color id → new color id map.
    const colorIdMap = new Map<string, string>()
    for (const c of ((src as any).colors ?? [])) {
      const { data: ins, error } = await sb
        .from('product_colors')
        .insert({ product_id: product.id, name: c.name, hex: c.hex, position: c.position ?? 0 })
        .select('id')
        .single()
      if (error) throw error
      colorIdMap.set(c.id, ins.id)
    }

    // * 3. Gallery images — copy each storage file then insert the row.
    for (const img of ((src as any).images ?? [])) {
      const newPath = await copyStorageImage(sb, img.image_path)
      copiedPaths.push(newPath)
      const { error } = await sb.from('product_images').insert({
        product_id: product.id,
        image_path: newPath,
        position: img.position ?? 0,
        color_id: img.color_id ? colorIdMap.get(img.color_id) ?? null : null,
      })
      if (error) throw error
    }

    // * 4. Paid options.
    for (const o of ((src as any).options ?? [])) {
      const { error } = await sb.from('product_options').insert({
        product_id: product.id,
        name: o.name,
        price: o.price ?? 0,
        position: o.position ?? 0,
        allow_custom_input: !!o.allow_custom_input,
        input_label: o.allow_custom_input ? (o.input_label ?? null) : null,
      })
      if (error) throw error
    }

    // * 4b. Size-guide links — copy the assignments (guides themselves are shared).
    const guideRows = ((src as any).size_guide_links ?? [])
      .map((l: any) => l.guide?.id)
      .filter((id: string | undefined): id is string => !!id)
      .map((size_guide_id: string, position: number) => ({
        product_id: product.id,
        size_guide_id,
        position,
      }))
    if (guideRows.length) {
      const { error } = await sb.from('product_size_guides').insert(guideRows)
      if (error) throw error
    }

    if ((src as any).is_pack) {
      // * 5a. Bundle composition (no own variants).
      const rows = ((src as any).bundle_components ?? []).map((bc: any) => ({
        bundle_product_id: product.id,
        component_product_id: bc.component_product_id,
        axis: bc.axis,
        quantity: bc.quantity ?? 1,
      }))
      if (rows.length) {
        const { error } = await sb.from('bundle_components').insert(rows)
        if (error) throw error
      }
    } else {
      // * 5b. Size variants — SKU cleared (UNIQUE), color id remapped.
      const rows = ((src as any).variants ?? []).map((v: any) => ({
        product_id: product.id,
        size: v.size,
        stock: v.stock,
        sku: null,
        footspot_size: v.footspot_size ?? null,
        color_id: v.color_id ? colorIdMap.get(v.color_id) ?? null : null,
      }))
      if (rows.length) {
        const { error } = await sb.from('product_variants').insert(rows)
        if (error) throw error
      }
    }
  } catch (e) {
    // * Roll back: drop the partial product (cascades children) + copied files.
    await sb.from('products').delete().eq('id', product.id)
    await cleanupUploads(sb, copiedPaths)
    throw e
  }

  const { data: full, error: fErr } = await sb
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', product.id)
    .single()
  if (fErr) throw fErr
  return full
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const guard = await verifyBackoffice(req)
  if (guard instanceof Response) return guard

  const sb = serviceClient()
  const url = new URL(req.url)
  // * Sub-action off the URL path segment (e.g. /backoffice-products/reorder),
  // * mirroring admin-sports. Empty for the plain CRUD endpoint.
  const action = url.pathname.split('/').filter(Boolean)[1] ?? ''
  const contentType = req.headers.get('content-type') ?? ''
  const isMultipart = contentType.startsWith('multipart/form-data')

  try {
    // * Reorder — persist a new sort_order for a set of products (JSON only).
    // * Used by the admin drag-and-drop product ordering, scoped to one club.
    if (req.method === 'POST' && action === 'reorder') {
      const body = (await req.json()) as { order?: Array<{ id: string; sort_order: number }> }
      if (!Array.isArray(body?.order)) {
        return jsonResponse({ error: 'invalid order payload' }, { status: 400 })
      }
      const updates = body.order.map(({ id, sort_order }) =>
        sb.from('products').update({ sort_order }).eq('id', id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
      return jsonResponse({ ok: true })
    }

    // * Update-category — bulk rename or delete a free-text product category
    // * (JSON only). Categories aren't a table: they're the distinct strings on
    // * products.category, so "rename" rewrites every matching row and "delete"
    // * (empty `to`) nulls them out. Renaming onto an existing name merges them.
    if (req.method === 'POST' && action === 'update-category') {
      const body = (await req.json()) as { from?: string; to?: string | null }
      const from = (body?.from ?? '').trim()
      if (!from) return jsonResponse({ error: 'from required' }, { status: 400 })
      const to = typeof body?.to === 'string' ? body.to.trim() : ''
      const next = to === '' ? null : to
      const { data, error } = await sb
        .from('products')
        .update({ category: next })
        .eq('category', from)
        .select('id')
      if (error) throw error
      return jsonResponse({ ok: true, affected: data?.length ?? 0 })
    }

    // * Duplicate — deep-copy a product into a new, hidden draft (JSON only).
    // * Copies pricing/flocking fields, colors, size variants (SKU cleared —
    // * SKUs are UNIQUE), paid options, gallery images (storage files copied),
    // * and bundle composition. The admin edits + publishes the copy afterwards.
    if (req.method === 'POST' && action === 'duplicate') {
      const body = (await req.json()) as { id?: string }
      if (!body?.id) return jsonResponse({ error: 'id required' }, { status: 400 })
      const newProduct = await duplicateProduct(sb, body.id)
      if (!newProduct) return jsonResponse({ error: 'product not found' }, { status: 404 })
      return jsonResponse({ product: newProduct }, { status: 201 })
    }

    if (req.method === 'POST') {
      const { data, files } = isMultipart
        ? await parseMultipartFiles<ProductData>(req)
        : { data: (await req.json()) as ProductData, files: {} as Record<string, File> }

      if (!data?.club_id) return jsonResponse({ error: 'club_id required' }, { status: 400 })
      if (!data?.name?.fr || !data?.name?.en)
        return jsonResponse({ error: 'name.fr and name.en required' }, { status: 400 })
      if (!data?.reference?.trim())
        return jsonResponse({ error: 'reference required' }, { status: 400 })

      const priceErr = validatePricing(data)
      if (priceErr) return jsonResponse({ error: priceErr }, { status: 400 })

      const slotsResult = normaliseSlots(data.image_slots, files)
      if (typeof slotsResult === 'string') return jsonResponse({ error: slotsResult }, { status: 400 })
      // * On create there are no pre-existing paths to reference.
      if (slotsResult.some((s) => s.existing))
        return jsonResponse({ error: 'cannot reference existing images on create' }, { status: 400 })

      const optionsResult = normaliseOptions(data.options)
      if (typeof optionsResult === 'string') return jsonResponse({ error: optionsResult }, { status: 400 })

      const isPack = !!data.is_pack
      let components: BundleComponentPayload[] = []
      let variants: VariantPayload[] = []

      if (isPack) {
        const c = normaliseComponents(data.components)
        if (typeof c === 'string') return jsonResponse({ error: c }, { status: 400 })
        components = c

        const compIds = components.map((x) => x.component_product_id)
        const compProducts = await loadComponentProducts(sb, compIds)
        if (compProducts.length !== compIds.length) {
          return jsonResponse({ error: 'one or more components not found' }, { status: 400 })
        }
        const wrongClub = compProducts.find((p) => p.club_id !== data.club_id)
        if (wrongClub)
          return jsonResponse({ error: 'component belongs to a different club' }, { status: 400 })
        const nestedPack = compProducts.find((p) => p.is_pack)
        if (nestedPack)
          return jsonResponse({ error: 'cannot nest a bundle inside another' }, { status: 400 })
      } else {
        const v = normaliseVariants(data.variants)
        if (typeof v === 'string') return jsonResponse({ error: v }, { status: 400 })
        variants = v
      }

      // * Colors only apply to regular products (packs carry none).
      const colorsRes = isPack ? [] : normaliseColors(data.colors)
      if (typeof colorsRes === 'string') return jsonResponse({ error: colorsRes }, { status: 400 })
      const colors: ColorPayload[] = colorsRes
      const definedKeys = new Set(colors.map((c) => c.key))
      const refErr = colorRefError(
        [...variants.map((v) => v.color_key), ...slotsResult.map((s) => s.color_key)],
        definedKeys,
      )
      if (refErr) return jsonResponse({ error: refErr }, { status: 400 })

      // * Upload all new files first so the failure path is just storage cleanup.
      let uploadedPaths: string[] = []
      let finalItems: ResolvedImage[] = []
      try {
        const r = await applySlotsToStorage(sb, slotsResult, files)
        uploadedPaths = r.uploaded
        finalItems = r.items
      } catch (e) {
        await cleanupUploads(sb, uploadedPaths)
        throw e
      }

      const { data: product, error: pErr } = await sb
        .from('products')
        .insert(productRow(data))
        .select()
        .single()
      if (pErr) {
        await cleanupUploads(sb, uploadedPaths)
        throw pErr
      }

      try {
        // * Insert colors first so images + variants can resolve their color_id.
        const keyToId = await resolveColors(sb, product.id, colors)

        if (finalItems.length > 0) {
          await replaceProductImages(sb, product.id, finalItems, keyToId)
        }

        await replaceProductOptions(sb, product.id, optionsResult)

        await replaceProductSizeGuides(sb, product.id, normaliseSizeGuideIds(data.size_guide_ids))

        if (isPack) {
          const rows = components.map((c) => ({
            bundle_product_id: product.id,
            component_product_id: c.component_product_id,
            axis: c.axis,
            quantity: c.quantity ?? 1,
          }))
          const { error: bcErr } = await sb.from('bundle_components').insert(rows)
          if (bcErr) throw bcErr
          await emitBundleLockNotifications(
            sb,
            product.id,
            product.name?.fr ?? product.reference,
            product.club_id,
            [],
            components.map((c) => c.component_product_id),
          )
        } else {
          const { error: vErr } = await sb.from('product_variants').insert(
            variants.map((v) => ({
              product_id: product.id,
              size: v.size,
              stock: v.stock,
              sku: v.sku ?? null,
              footspot_size: v.footspot_size ?? null,
              color_id: v.color_key ? keyToId.get(v.color_key) ?? null : null,
            })),
          )
          if (vErr) throw vErr
        }
      } catch (e) {
        await sb.from('products').delete().eq('id', product.id)
        await cleanupUploads(sb, uploadedPaths)
        throw e
      }

      const { data: full, error: fErr } = await sb
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('id', product.id)
        .single()
      if (fErr) {
        console.error('[backoffice-products] reload after insert failed', fErr)
        throw fErr
      }
      return jsonResponse({ product: full }, { status: 201 })
    }

    if (req.method === 'PUT') {
      const { data, files } = isMultipart
        ? await parseMultipartFiles<ProductData>(req)
        : { data: (await req.json()) as ProductData, files: {} as Record<string, File> }

      if (!data?.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const priceErr = validatePricing(data)
      if (priceErr) return jsonResponse({ error: priceErr }, { status: 400 })

      const slotsResult = normaliseSlots(data.image_slots, files)
      if (typeof slotsResult === 'string') return jsonResponse({ error: slotsResult }, { status: 400 })

      // * Options are optional on PUT: when the key is omitted entirely we leave
      // * the existing set untouched (so toggle-only updates don't wipe them);
      // * when present (even as []) we replace the whole set.
      const optionsProvided = data.options !== undefined && data.options !== null
      const optionsResult = normaliseOptions(data.options)
      if (typeof optionsResult === 'string') return jsonResponse({ error: optionsResult }, { status: 400 })

      const isPack = !!data.is_pack
      let components: BundleComponentPayload[] = []
      let variants: VariantPayload[] = []

      if (isPack) {
        const c = normaliseComponents(data.components)
        if (typeof c === 'string') return jsonResponse({ error: c }, { status: 400 })
        components = c
        const compIds = components.map((x) => x.component_product_id)
        const compProducts = await loadComponentProducts(sb, compIds)
        if (compProducts.length !== compIds.length)
          return jsonResponse({ error: 'one or more components not found' }, { status: 400 })
        const wrongClub = compProducts.find((p) => p.club_id !== data.club_id)
        if (wrongClub)
          return jsonResponse({ error: 'component belongs to a different club' }, { status: 400 })
        const nestedPack = compProducts.find((p) => p.is_pack)
        if (nestedPack)
          return jsonResponse({ error: 'cannot nest a bundle inside another' }, { status: 400 })
      } else {
        const v = normaliseVariants(data.variants)
        if (typeof v === 'string') return jsonResponse({ error: v }, { status: 400 })
        variants = v
      }

      // * Colors only apply to regular products (packs carry none). Like
      // * variants/image_slots, the whole set is replaced on every save.
      const colorsRes = isPack ? [] : normaliseColors(data.colors)
      if (typeof colorsRes === 'string') return jsonResponse({ error: colorsRes }, { status: 400 })
      const colors: ColorPayload[] = colorsRes
      const definedKeys = new Set(colors.map((c) => c.key))
      const refErr = colorRefError(
        [...variants.map((v) => v.color_key), ...slotsResult.map((s) => s.color_key)],
        definedKeys,
      )
      if (refErr) return jsonResponse({ error: refErr }, { status: 400 })

      const { data: current, error: cErr } = await sb
        .from('products')
        .select('is_pack, name, club_id, product_images(image_path)')
        .eq('id', data.id)
        .single()
      if (cErr) throw cErr

      const previousPaths: string[] = ((current as any)?.product_images ?? []).map(
        (r: any) => r.image_path,
      )
      const prevSet = new Set(previousPaths)

      // * Every `existing` path must come from this product's current gallery.
      for (const s of slotsResult) {
        if (s.existing && !prevSet.has(s.existing)) {
          return jsonResponse({ error: 'unknown existing image path' }, { status: 400 })
        }
      }

      let uploadedPaths: string[] = []
      let finalItems: ResolvedImage[] = []
      try {
        const r = await applySlotsToStorage(sb, slotsResult, files)
        uploadedPaths = r.uploaded
        finalItems = r.items
      } catch (e) {
        await cleanupUploads(sb, uploadedPaths)
        throw e
      }
      const finalPaths = finalItems.map((i) => i.image_path)

      try {
        const { error: pErr } = await sb
          .from('products')
          .update(productRow(data))
          .eq('id', data.id)
        if (pErr) throw pErr

        // * Resolve colors before images/variants so they can map color_id.
        // * Removed colors cascade-drop their variants here, so the variant
        // * diff below operates on the surviving set.
        const keyToId = await resolveColors(sb, data.id!, colors)

        await replaceProductImages(sb, data.id!, finalItems, keyToId)

        if (optionsProvided) await replaceProductOptions(sb, data.id!, optionsResult)

        // * Size guides: omitted → leave untouched (toggle-only updates don't
        // * wipe them); present (even as []) → replace the whole set.
        if (data.size_guide_ids !== undefined && data.size_guide_ids !== null) {
          await replaceProductSizeGuides(sb, data.id!, normaliseSizeGuideIds(data.size_guide_ids))
        }

        if (isPack) {
          // * Drop any lingering variants if the product used to be non-pack.
          await sb.from('product_variants').delete().eq('product_id', data.id)

          // * Diff component set for notifications.
          const { data: existingBc } = await sb
            .from('bundle_components')
            .select('component_product_id')
            .eq('bundle_product_id', data.id)
          const previousIds = (existingBc ?? []).map((r: any) => r.component_product_id)
          const nextIds = components.map((c) => c.component_product_id)

          await sb.from('bundle_components').delete().eq('bundle_product_id', data.id)
          const rows = components.map((c) => ({
            bundle_product_id: data.id,
            component_product_id: c.component_product_id,
            axis: c.axis,
            quantity: c.quantity ?? 1,
          }))
          const { error: bcErr } = await sb.from('bundle_components').insert(rows)
          if (bcErr) throw bcErr

          await emitBundleLockNotifications(
            sb,
            data.id!,
            data.name?.fr ?? current.name?.fr ?? '',
            data.club_id,
            previousIds,
            nextIds,
          )
        } else {
          // * If product used to be a pack, clear its bundle_components (release).
          if (current?.is_pack) {
            const { data: wasBc } = await sb
              .from('bundle_components')
              .select('component_product_id')
              .eq('bundle_product_id', data.id)
            const previousIds = (wasBc ?? []).map((r: any) => r.component_product_id)
            await sb.from('bundle_components').delete().eq('bundle_product_id', data.id)
            await emitBundleLockNotifications(
              sb,
              data.id!,
              current?.name?.fr ?? '',
              current?.club_id,
              previousIds,
              [],
            )
          }

          // * Diff-and-apply variants.
          const { data: existing, error: existErr } = await sb
            .from('product_variants')
            .select('id, size')
            .eq('product_id', data.id)
          if (existErr) throw existErr

          const keepIds = new Set<string>()
          for (const v of variants) {
            const row = {
              size: v.size,
              stock: v.stock,
              sku: v.sku ?? null,
              footspot_size: v.footspot_size ?? null,
              color_id: v.color_key ? keyToId.get(v.color_key) ?? null : null,
            }
            if (v.id) {
              keepIds.add(v.id)
              const { error: uErr } = await sb
                .from('product_variants')
                .update(row)
                .eq('id', v.id)
              if (uErr) throw uErr
            } else {
              const { data: inserted, error: iErr } = await sb
                .from('product_variants')
                .insert({ product_id: data.id, ...row })
                .select('id')
                .single()
              if (iErr) throw iErr
              if (inserted?.id) keepIds.add(inserted.id)
            }
          }
          const toDelete = (existing ?? []).filter((e) => !keepIds.has(e.id)).map((e) => e.id)
          if (toDelete.length > 0) {
            const { error: dErr } = await sb.from('product_variants').delete().in('id', toDelete)
            if (dErr) throw dErr
          }
        }
      } catch (e) {
        await cleanupUploads(sb, uploadedPaths)
        throw e
      }

      // * Remove storage files that no longer belong to this product's gallery.
      const finalSet = new Set(finalPaths)
      const toRemove = previousPaths.filter((p) => !finalSet.has(p))
      await cleanupUploads(sb, toRemove)

      const { data: full, error: fErr } = await sb
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('id', data.id)
        .single()
      if (fErr) {
        console.error('[backoffice-products] reload after update failed', fErr)
        throw fErr
      }
      return jsonResponse({ product: full })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { count: orderCount, error: countErr } = await sb
        .from('order_items')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', id)
      if (countErr) throw countErr
      if ((orderCount ?? 0) > 0) {
        return jsonResponse({ error: 'product_has_orders', order_count: orderCount }, { status: 409 })
      }

      // * If this product is a component in some bundle, refuse.
      const { count: usedInBundles } = await sb
        .from('bundle_components')
        .select('*', { count: 'exact', head: true })
        .eq('component_product_id', id)
      if ((usedInBundles ?? 0) > 0) {
        return jsonResponse(
          { error: 'product_locked_in_bundle', bundle_count: usedInBundles },
          { status: 409 },
        )
      }

      // * If this product is a bundle, release its components (emit notifications).
      const { data: cur } = await sb
        .from('products')
        .select('is_pack, name, club_id, product_images(image_path)')
        .eq('id', id)
        .single()
      if (cur?.is_pack) {
        const { data: bc } = await sb
          .from('bundle_components')
          .select('component_product_id')
          .eq('bundle_product_id', id)
        const previousIds = (bc ?? []).map((r: any) => r.component_product_id)
        await emitBundleLockNotifications(
          sb,
          id,
          cur.name?.fr ?? '',
          cur.club_id,
          previousIds,
          [],
        )
      }

      const { error } = await sb.from('products').delete().eq('id', id)
      if (error) throw error

      const paths: string[] = ((cur as any)?.product_images ?? []).map((r: any) => r.image_path)
      await cleanupUploads(sb, paths)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const e = err as { message?: string; code?: string; details?: string; hint?: string }
    const msg = e?.message || (err instanceof Error ? err.message : 'Unknown error')
    console.error('[backoffice-products]', {
      message: e?.message, code: e?.code, details: e?.details, hint: e?.hint,
    })
    return jsonResponse(
      { error: msg, code: e?.code, details: e?.details, hint: e?.hint },
      { status: 500 },
    )
  }
})
