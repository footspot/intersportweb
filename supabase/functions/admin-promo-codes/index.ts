// * admin-promo-codes — CRUD for promo codes. Admin only.
// *
// * Single codes:
// *   - `code` and `amount` are immutable once created. Mutable: min_subtotal,
// *     valid_from, valid_until, absorbs_by, note, club_id.
// *   - Deletion only allowed while used_at IS NULL.
// *
// * Batches (light tracking — no separate table):
// *   - Codes that share `batch_id` were generated together. They share amount,
// *     min_subtotal, absorbs_by, validity window, note and club_id.
// *   - `club_id` is metadata + PDF branding only; redemption is NOT restricted.
// *
// * Routes:
// *   GET    /                    list single codes (no batch_id) + per-status filter
// *   GET    /batches             aggregate list of batches
// *   GET    /batch?id=<uuid>     list codes inside one batch (for PDF re-download)
// *   GET    /lookup?q=<code|email>  support check: a code (any batch) with
// *                                every order that carried it, or every code
// *                                used / tried by a customer email
// *   POST   /                    create one custom code
// *   POST   /batch               bulk-generate N codes (PREFIX-XXXXXX format)
// *   PUT    /                    update single code metadata
// *   DELETE /?id=<uuid>          delete unused single code
// *   DELETE /batch?id=<uuid>     delete an entire batch (only if no code is used)
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'

type PromoScope = 'global' | 'club' | 'products'

interface PromoPayload {
  id?: string
  code?: string
  amount?: number
  min_subtotal?: number | null
  absorbs_by?: 'intersport' | 'club'
  valid_from?: string | null
  valid_until?: string | null
  note?: string | null
  club_id?: string | null
  scope?: PromoScope
  scope_product_ids?: string[] | null
}

interface BatchPayload {
  count?: number
  prefix?: string
  amount?: number
  min_subtotal?: number | null
  absorbs_by?: 'intersport' | 'club'
  valid_from?: string | null
  valid_until?: string | null
  note?: string | null
  club_id?: string | null
  scope?: PromoScope
  scope_product_ids?: string[] | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// * Must stay under the project's PostgREST max-rows cap (1000), otherwise a
// * page comes back truncated and looks like the last one.
const BATCH_PAGE_SIZE = 500

const PROMO_COLS =
  'id, code, amount, min_subtotal, absorbs_by, valid_from, valid_until, note, used_at, used_by_order_id, used_by_email, created_at, batch_id, club_id, scope, scope_product_ids'

const LOOKUP_ORDER_COLS =
  'id, order_number, status, created_at, paid_at, total, subtotal, promo_discount, refund_total, promo_code_id, guest_email, guest_first_name, guest_last_name, shipping_address'

// * Escape LIKE wildcards so `_` / `%` in a code or email match literally.
function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

// * Levenshtein distance, giving up (returns max + 1) once it exceeds `max`.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]!
}

interface LookupOrderRow {
  id: string
  order_number: string
  status: string
  created_at: string
  paid_at: string | null
  total: number | string
  subtotal: number | string
  promo_discount: number | string
  refund_total: number | string | null
  promo_code_id: string | null
  guest_email: string | null
  guest_first_name: string | null
  guest_last_name: string | null
  shipping_address: { email?: string; full_name?: string; phone?: string } | null
}

// * Flatten an order for the lookup screen — only the customer identity the
// * admin needs to settle a dispute, never the postal address.
function toLookupOrder(o: LookupOrderRow) {
  const guestName = [o.guest_first_name, o.guest_last_name].filter(Boolean).join(' ')
  return {
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    created_at: o.created_at,
    paid_at: o.paid_at,
    total: Number(o.total),
    subtotal: Number(o.subtotal),
    promo_discount: Number(o.promo_discount),
    refund_total: Number(o.refund_total ?? 0),
    promo_code_id: o.promo_code_id,
    email: o.guest_email ?? o.shipping_address?.email ?? null,
    name: guestName || o.shipping_address?.full_name || null,
    phone: o.shipping_address?.phone ?? null,
  }
}

interface ResolvedScope {
  scope: PromoScope
  club_id: string | null
  scope_product_ids: string[]
}

// * Resolve + validate the scope of a code from an admin payload.
// *   - global   → club_id stays optional (branding only), no products.
// *   - club     → club_id required.
// *   - products → a non-empty product list, all belonging to ONE club; that
// *                club is derived and stored in club_id (single-club packs).
async function resolveScope(
  sb: ReturnType<typeof serviceClient>,
  body: PromoPayload | BatchPayload,
): Promise<ResolvedScope | { error: string }> {
  const scope: PromoScope =
    body.scope === 'club' || body.scope === 'products' ? body.scope : 'global'
  const clubId = body.club_id && UUID_RE.test(body.club_id) ? body.club_id : null

  if (scope === 'global') {
    return { scope, club_id: clubId, scope_product_ids: [] }
  }
  if (scope === 'club') {
    if (!clubId) return { error: 'scope_club_required' }
    return { scope, club_id: clubId, scope_product_ids: [] }
  }
  // * scope === 'products'
  const raw = Array.isArray(body.scope_product_ids) ? body.scope_product_ids : []
  const ids = Array.from(
    new Set(raw.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x))),
  )
  if (ids.length === 0) return { error: 'scope_products_required' }
  const { data: prods, error } = await sb.from('products').select('id, club_id').in('id', ids)
  if (error) return { error: 'scope_products_invalid' }
  if (!prods || prods.length !== ids.length) return { error: 'scope_products_invalid' }
  const clubs = new Set((prods as Array<{ club_id: string }>).map((p) => p.club_id))
  if (clubs.size !== 1) return { error: 'scope_products_multi_club' }
  return { scope, club_id: (prods as Array<{ club_id: string }>)[0]!.club_id, scope_product_ids: ids }
}

function sanitiseCode(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (trimmed.length < 3 || trimmed.length > 32) return null
  if (!/^[A-Z0-9_-]+$/.test(trimmed)) return null
  return trimmed
}

// * Prefix accepts the same charset as a code, plus trailing '-' is preserved.
// * Empty prefix is allowed (codes will be just the random part).
function sanitisePrefix(raw: string | undefined): string | null {
  if (raw == null) return ''
  const trimmed = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (trimmed === '') return ''
  if (trimmed.length > 16) return null
  if (!/^[A-Z0-9_-]+$/.test(trimmed)) return null
  return trimmed
}

// * Unambiguous alphabet (no 0/O/1/I/L) — random part of generated codes.
const RAND_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const RAND_LEN = 6

function randomSuffix(): string {
  const bytes = new Uint8Array(RAND_LEN)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < RAND_LEN; i++) {
    out += RAND_ALPHABET[bytes[i]! % RAND_ALPHABET.length]
  }
  return out
}

function buildBatchCode(prefix: string): string {
  return prefix ? `${prefix}-${randomSuffix()}` : randomSuffix()
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const guard = await verifyAdmin(req)
  if (guard instanceof Response) return guard

  const sb = serviceClient()
  const url = new URL(req.url)
  // * Sub-action lives in the trailing path segment, matching the convention
  // * of every other admin-* function in this project.
  const segments = url.pathname.split('/').filter(Boolean)
  const action = segments[segments.length - 1] === 'admin-promo-codes' ? '' : segments[segments.length - 1]

  try {
    // ─────────────────────────── GET ────────────────────────────
    if (req.method === 'GET') {
      if (action === 'batches') {
        // * Aggregate per batch: one row per batch_id with counts + shared metadata.
        // * Paged: a single select is silently truncated at the project's
        // * PostgREST max-rows cap (1000), which dropped the oldest batches and
        // * under-counted their used codes once the table grew past 1000 codes.
        const data: unknown[] = []
        for (let from = 0; ; from += BATCH_PAGE_SIZE) {
          const { data: page, error } = await sb
            .from('promo_codes')
            .select(
              'batch_id, amount, min_subtotal, absorbs_by, valid_from, valid_until, note, club_id, scope, scope_product_ids, created_at, created_by, used_at',
            )
            .not('batch_id', 'is', null)
            .order('created_at', { ascending: false })
            .order('id', { ascending: true })
            .range(from, from + BATCH_PAGE_SIZE - 1)
          if (error) throw error
          data.push(...(page ?? []))
          if ((page?.length ?? 0) < BATCH_PAGE_SIZE) break
        }

        const rows = data as Array<{
          batch_id: string
          amount: number
          min_subtotal: number | null
          absorbs_by: 'intersport' | 'club'
          valid_from: string | null
          valid_until: string | null
          note: string | null
          club_id: string | null
          scope: PromoScope
          scope_product_ids: string[] | null
          created_at: string
          created_by: string | null
          used_at: string | null
        }>

        // * Group in-memory — batches are admin-side and small (typically <100).
        const grouped = new Map<string, {
          batch_id: string
          count: number
          used_count: number
          amount: number
          min_subtotal: number | null
          absorbs_by: 'intersport' | 'club'
          valid_from: string | null
          valid_until: string | null
          note: string | null
          club_id: string | null
          scope: PromoScope
          scope_product_ids: string[] | null
          created_at: string
          created_by: string | null
        }>()
        for (const r of rows) {
          const g = grouped.get(r.batch_id)
          if (g) {
            g.count++
            if (r.used_at) g.used_count++
          } else {
            grouped.set(r.batch_id, {
              batch_id: r.batch_id,
              count: 1,
              used_count: r.used_at ? 1 : 0,
              amount: Number(r.amount),
              min_subtotal: r.min_subtotal != null ? Number(r.min_subtotal) : null,
              absorbs_by: r.absorbs_by,
              valid_from: r.valid_from,
              valid_until: r.valid_until,
              note: r.note,
              club_id: r.club_id,
              scope: r.scope,
              scope_product_ids: r.scope_product_ids ?? [],
              created_at: r.created_at,
              created_by: r.created_by,
            })
          }
        }
        return jsonResponse({ items: Array.from(grouped.values()) })
      }

      if (action === 'batch') {
        const id = url.searchParams.get('id')
        if (!id || !UUID_RE.test(id)) {
          return jsonResponse({ error: 'invalid_batch_id' }, { status: 400 })
        }
        const { data, error } = await sb
          .from('promo_codes')
          .select('*')
          .eq('batch_id', id)
          .order('code', { ascending: true })
        if (error) throw error
        return jsonResponse({ items: data ?? [] })
      }

      if (action === 'lookup') {
        const raw = (url.searchParams.get('q') ?? '').trim()
        if (raw.length < 3 || raw.length > 254) {
          return jsonResponse({ error: 'invalid_query' }, { status: 400 })
        }

        // * Email mode: every code this customer redeemed + every order in
        // * which they entered a code (paid or not). Same email resolution as
        // * claim_promo_for_order: guest_email, else shipping_address.email.
        if (raw.includes('@')) {
          const email = likeEscape(raw.toLowerCase())
          // * Two order queries instead of one or() filter: an escaped `_`
          // * (common in emails) is ambiguous inside PostgREST's or() syntax.
          const ordersQuery = (column: string) =>
            sb
              .from('orders')
              .select(LOOKUP_ORDER_COLS)
              .not('promo_code_id', 'is', null)
              .ilike(column, email)
              .order('created_at', { ascending: false })
              .limit(200)
          const [usedRes, byGuestRes, byShippingRes] = await Promise.all([
            sb
              .from('promo_codes')
              .select(PROMO_COLS)
              .ilike('used_by_email', email)
              .order('used_at', { ascending: false })
              .limit(200),
            ordersQuery('guest_email'),
            ordersQuery('shipping_address->>email'),
          ])
          if (usedRes.error) throw usedRes.error
          if (byGuestRes.error) throw byGuestRes.error
          if (byShippingRes.error) throw byShippingRes.error

          const orderById = new Map<string, LookupOrderRow>()
          for (const o of [...(byGuestRes.data ?? []), ...(byShippingRes.data ?? [])] as LookupOrderRow[]) {
            orderById.set(o.id, o)
          }
          const orderRows = [...orderById.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))

          const codes = new Map<string, unknown>()
          for (const c of usedRes.data ?? []) codes.set((c as { id: string }).id, c)
          // * Codes the customer tried without redeeming (abandoned, race loss…).
          const missing = [
            ...new Set(
              orderRows
                .map((o) => o.promo_code_id)
                .filter((id): id is string => !!id && !codes.has(id)),
            ),
          ]
          if (missing.length) {
            const { data, error } = await sb.from('promo_codes').select(PROMO_COLS).in('id', missing)
            if (error) throw error
            for (const c of data ?? []) codes.set((c as { id: string }).id, c)
          }

          return jsonResponse({
            mode: 'email',
            query: raw,
            codes: [...codes.values()],
            orders: orderRows.map(toLookupOrder),
          })
        }

        // * Code mode — same normalisation as validate-promo-code.
        const code = raw.toUpperCase().replace(/\s+/g, '')
        const { data: promo, error } = await sb
          .from('promo_codes')
          .select(PROMO_COLS)
          .ilike('code', likeEscape(code))
          .maybeSingle()
        if (error) throw error

        if (!promo) {
          // * Near matches, for a code misread off a voucher (0/O, 1/I, a
          // * dropped prefix or dash…). Compared against every code — the typo
          // * can sit in the prefix too — paged past the max-rows cap.
          const candidates: string[] = []
          for (let from = 0; ; from += BATCH_PAGE_SIZE) {
            const { data: page, error: sErr } = await sb
              .from('promo_codes')
              .select('code')
              .order('id', { ascending: true })
              .range(from, from + BATCH_PAGE_SIZE - 1)
            if (sErr) throw sErr
            for (const r of page ?? []) candidates.push((r as { code: string }).code)
            if ((page?.length ?? 0) < BATCH_PAGE_SIZE) break
          }
          const suggestions = candidates
            .map((c) => {
              const upper = c.toUpperCase()
              // * A typed fragment of a real code (e.g. suffix without prefix) ranks first.
              const d = upper.includes(code) ? 0 : editDistance(code, upper, 2)
              return { c, d }
            })
            .filter((x) => x.d <= 2)
            .sort((a, b) => a.d - b.d || a.c.localeCompare(b.c))
            .slice(0, 10)
            .map((x) => x.c)
          return jsonResponse({
            mode: 'code',
            query: code,
            promo: null,
            orders: [],
            suggestions,
          })
        }

        // * Every order that carried the code — the redeeming one plus any
        // * abandoned / unpaid / refunded attempts.
        const { data: orders, error: oErr } = await sb
          .from('orders')
          .select(LOOKUP_ORDER_COLS)
          .eq('promo_code_id', (promo as { id: string }).id)
          .order('created_at', { ascending: false })
          .limit(200)
        if (oErr) throw oErr

        return jsonResponse({
          mode: 'code',
          query: code,
          promo,
          orders: ((orders ?? []) as LookupOrderRow[]).map(toLookupOrder),
          suggestions: [],
        })
      }

      // * Default list — single codes only (not part of a batch).
      const status = url.searchParams.get('status')
      let query = sb
        .from('promo_codes')
        .select('*')
        .is('batch_id', null)
        .order('created_at', { ascending: false })
      const now = new Date().toISOString()
      if (status === 'active') {
        query = query.is('used_at', null).or(`valid_until.is.null,valid_until.gt.${now}`)
      } else if (status === 'used') {
        query = query.not('used_at', 'is', null)
      } else if (status === 'expired') {
        query = query.is('used_at', null).lt('valid_until', now)
      }
      const { data, error } = await query
      if (error) throw error
      return jsonResponse({ items: data ?? [] })
    }

    // ─────────────────────────── POST ───────────────────────────
    if (req.method === 'POST') {
      if (action === 'batch') {
        const body = (await req.json()) as BatchPayload
        const count = Math.floor(Number(body.count))
        if (!isFinite(count) || count < 1 || count > 1000) {
          return jsonResponse({ error: 'invalid_count' }, { status: 400 })
        }
        const prefix = sanitisePrefix(body.prefix)
        if (prefix === null) {
          return jsonResponse({ error: 'invalid_prefix' }, { status: 400 })
        }
        const amount = Number(body.amount)
        if (!isFinite(amount) || amount <= 0) {
          return jsonResponse({ error: 'invalid_amount' }, { status: 400 })
        }
        const minSubtotal =
          body.min_subtotal != null && body.min_subtotal !== ''
            ? Number(body.min_subtotal)
            : null
        if (minSubtotal != null && (!isFinite(minSubtotal) || minSubtotal < amount)) {
          return jsonResponse({ error: 'invalid_min_subtotal' }, { status: 400 })
        }
        const absorbsBy = body.absorbs_by === 'club' ? 'club' : 'intersport'
        const scoped = await resolveScope(sb, body)
        if ('error' in scoped) {
          return jsonResponse({ error: scoped.error }, { status: 400 })
        }

        const batchId = crypto.randomUUID()
        const sharedRow = {
          amount,
          min_subtotal: minSubtotal,
          absorbs_by: absorbsBy,
          valid_from: body.valid_from || null,
          valid_until: body.valid_until || null,
          note: body.note?.trim() || null,
          club_id: scoped.club_id,
          scope: scoped.scope,
          scope_product_ids: scoped.scope_product_ids,
          batch_id: batchId,
          created_by: guard.id,
        }

        // * Generate codes in chunks; retry collisions by re-rolling just the
        // * losers. With a 6-char unambiguous-alphabet suffix the keyspace is
        // * ~887M — collisions are vanishingly rare in practice. We still
        // * handle them for safety (max 3 retries).
        const seen = new Set<string>()
        const rows: Array<typeof sharedRow & { code: string }> = []
        for (let i = 0; i < count; i++) {
          let code = buildBatchCode(prefix)
          while (seen.has(code)) code = buildBatchCode(prefix)
          seen.add(code)
          rows.push({ ...sharedRow, code })
        }

        let attempt = 0
        let toInsert = rows
        let inserted: unknown[] = []
        while (toInsert.length > 0 && attempt < 4) {
          const { data, error } = await sb
            .from('promo_codes')
            .insert(toInsert)
            .select('id, code, amount, min_subtotal, absorbs_by, valid_from, valid_until, note, used_at, used_by_order_id, used_by_email, created_at, batch_id, club_id, scope, scope_product_ids')
          if (!error) {
            inserted = inserted.concat(data ?? [])
            toInsert = []
            break
          }
          if ((error as { code?: string }).code !== '23505') {
            throw error
          }
          // * Collision: re-roll every code in the failing batch (PostgREST
          // * doesn't tell us which row collided on a multi-insert). On the
          // * second pass, also confirm against DB what's already inserted.
          attempt++
          if (attempt >= 4) {
            return jsonResponse({ error: 'code_collision_retry_exhausted' }, { status: 500 })
          }
          // * Fetch what's already in the DB for this batch, so we re-roll
          // * only the missing codes.
          const { data: alreadyIn } = await sb
            .from('promo_codes')
            .select('code')
            .eq('batch_id', batchId)
          const have = new Set((alreadyIn ?? []).map((r) => (r as { code: string }).code))
          inserted = (alreadyIn ?? []) as unknown[]
          const missing = count - have.size
          const remixed: typeof toInsert = []
          const tried = new Set<string>(have)
          for (let i = 0; i < missing; i++) {
            let code = buildBatchCode(prefix)
            while (tried.has(code)) code = buildBatchCode(prefix)
            tried.add(code)
            remixed.push({ ...sharedRow, code })
          }
          toInsert = remixed
        }

        return jsonResponse({ batch_id: batchId, count: inserted.length, items: inserted }, { status: 201 })
      }

      // * Default — single code create (legacy behaviour).
      const body = (await req.json()) as PromoPayload
      const code = sanitiseCode(body.code)
      const amount = Number(body.amount)
      if (!code) return jsonResponse({ error: 'invalid_code' }, { status: 400 })
      if (!isFinite(amount) || amount <= 0) {
        return jsonResponse({ error: 'invalid_amount' }, { status: 400 })
      }
      const minSubtotal =
        body.min_subtotal != null && body.min_subtotal !== ''
          ? Number(body.min_subtotal)
          : null
      if (minSubtotal != null && (!isFinite(minSubtotal) || minSubtotal < amount)) {
        return jsonResponse({ error: 'invalid_min_subtotal' }, { status: 400 })
      }
      const absorbsBy = body.absorbs_by === 'club' ? 'club' : 'intersport'
      const scoped = await resolveScope(sb, body)
      if ('error' in scoped) {
        return jsonResponse({ error: scoped.error }, { status: 400 })
      }

      const { data, error } = await sb
        .from('promo_codes')
        .insert({
          code,
          amount,
          min_subtotal: minSubtotal,
          absorbs_by: absorbsBy,
          valid_from: body.valid_from || null,
          valid_until: body.valid_until || null,
          note: body.note?.trim() || null,
          club_id: scoped.club_id,
          scope: scoped.scope,
          scope_product_ids: scoped.scope_product_ids,
          created_by: guard.id,
        })
        .select()
        .single()
      if (error) {
        if ((error as { code?: string }).code === '23505') {
          return jsonResponse({ error: 'code_already_exists' }, { status: 409 })
        }
        throw error
      }
      return jsonResponse({ promo: data }, { status: 201 })
    }

    // ─────────────────────────── PUT ────────────────────────────
    if (req.method === 'PUT') {
      const body = (await req.json()) as PromoPayload
      if (!body.id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: existing, error: fetchErr } = await sb
        .from('promo_codes')
        .select('id, amount, used_at')
        .eq('id', body.id)
        .single()
      if (fetchErr || !existing) {
        return jsonResponse({ error: 'not_found' }, { status: 404 })
      }
      if (existing.used_at) {
        return jsonResponse({ error: 'code_already_used' }, { status: 409 })
      }

      const patch: Record<string, unknown> = {}
      if (body.min_subtotal !== undefined) {
        if (body.min_subtotal === null) {
          patch.min_subtotal = null
        } else {
          const n = Number(body.min_subtotal)
          if (!isFinite(n) || n < Number(existing.amount)) {
            return jsonResponse({ error: 'invalid_min_subtotal' }, { status: 400 })
          }
          patch.min_subtotal = n
        }
      }
      if (body.absorbs_by !== undefined) {
        patch.absorbs_by = body.absorbs_by === 'club' ? 'club' : 'intersport'
      }
      if (body.valid_from !== undefined) patch.valid_from = body.valid_from || null
      if (body.valid_until !== undefined) patch.valid_until = body.valid_until || null
      if (body.note !== undefined) patch.note = body.note?.trim() || null
      // * Scope edit: when `scope` is present we re-resolve all three columns
      // *   together (club_id is derived for product packs). Otherwise a bare
      // *   club_id change only touches branding on a global code.
      if (body.scope !== undefined) {
        const scoped = await resolveScope(sb, body)
        if ('error' in scoped) {
          return jsonResponse({ error: scoped.error }, { status: 400 })
        }
        patch.scope = scoped.scope
        patch.club_id = scoped.club_id
        patch.scope_product_ids = scoped.scope_product_ids
      } else if (body.club_id !== undefined) {
        patch.club_id = body.club_id && UUID_RE.test(body.club_id) ? body.club_id : null
      }

      const { data, error } = await sb
        .from('promo_codes')
        .update(patch)
        .eq('id', body.id)
        .select()
        .single()
      if (error) throw error
      return jsonResponse({ promo: data })
    }

    // ────────────────────────── DELETE ──────────────────────────
    if (req.method === 'DELETE') {
      if (action === 'batch') {
        const id = url.searchParams.get('id')
        if (!id || !UUID_RE.test(id)) {
          return jsonResponse({ error: 'invalid_batch_id' }, { status: 400 })
        }
        // * Refuse if any code in the batch has been used — preserves the
        // * audit trail for orders linked to it.
        const { count: usedCount, error: countErr } = await sb
          .from('promo_codes')
          .select('id', { count: 'exact', head: true })
          .eq('batch_id', id)
          .not('used_at', 'is', null)
        if (countErr) throw countErr
        if ((usedCount ?? 0) > 0) {
          return jsonResponse({ error: 'batch_has_used_codes' }, { status: 409 })
        }
        const { error } = await sb.from('promo_codes').delete().eq('batch_id', id)
        if (error) throw error
        return jsonResponse({ ok: true })
      }

      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })

      const { data: existing } = await sb
        .from('promo_codes')
        .select('id, used_at')
        .eq('id', id)
        .single()
      if (!existing) return jsonResponse({ error: 'not_found' }, { status: 404 })
      if (existing.used_at) {
        return jsonResponse({ error: 'code_already_used' }, { status: 409 })
      }
      const { error } = await sb.from('promo_codes').delete().eq('id', id)
      if (error) throw error
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-promo-codes]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
