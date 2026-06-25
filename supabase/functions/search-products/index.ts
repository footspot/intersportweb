// * search-products — public storefront product search.
// *
// * POST { q, sport_id?, page?, page_size? } → paginated matches.
// *
// * CONFIDENTIALITY: products of password-protected ("restricted") clubs MUST NOT
// * appear in results. The browser can't enforce this — the public products RLS
// * policy is `is_visible = true`, so a client query could simply drop the filter.
// * We therefore run server-side with the service role and exclude restricted
// * clubs here, in one inner-joined query. Clearance products are normal visible
// * club products and are included (badged via is_on_clearance).
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { computeUnitPricing } from '../_shared/pricing.ts'

interface SearchBody {
  q?: unknown
  sport_id?: unknown
  page?: unknown
  page_size?: unknown
}

const MIN_CHARS = 2
const DEFAULT_PAGE_SIZE = 12
const MAX_PAGE_SIZE = 24

// * Keep the value safe for a PostgREST `.or()` filter (commas/parens are
// * delimiters; `*`/`%` are wildcards). Collapse them to spaces.
function sanitizeQuery(raw: string): string {
  return raw.replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

function toInt(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, { status: 405 })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as SearchBody
    const q = sanitizeQuery(typeof body.q === 'string' ? body.q : '')
    const sportId = typeof body.sport_id === 'string' && body.sport_id ? body.sport_id : null
    const page = toInt(body.page, 1)
    const pageSize = Math.min(toInt(body.page_size, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)

    // * Too short → empty page (the client also guards, this is defence in depth).
    if (q.length < MIN_CHARS) {
      return jsonResponse({ results: [], total: 0, page, page_size: pageSize, has_more: false })
    }

    const sb = serviceClient()

    // * Bundle components remain sellable standalone, so they're not excluded here.
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    const like = `*${q}*`

    let query = sb
      .from('products')
      .select(
        `id, club_id, name, reference, category, selling_price, discount_percent,
         discount_source, buying_price, is_on_clearance, sort_order, created_at,
         images:product_images(image_path, position),
         club:clubs!inner(id, name, sport_id, is_password_protected, accent_color)`,
        { count: 'exact' },
      )
      .eq('is_visible', true)
      // * Confidentiality boundary — never return restricted-club products.
      .eq('club.is_password_protected', false)
      .or(`name->>fr.ilike.${like},name->>en.ilike.${like},reference.ilike.${like},category.ilike.${like}`)

    if (sportId) query = query.eq('club.sport_id', sportId)

    query = query
      .order('is_on_clearance', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .range(from, to)

    const { data, error, count } = await query
    if (error) throw error

    const results = (data ?? []).map((p) => {
      const row = p as Record<string, any>
      const pricing = computeUnitPricing({
        buying_price: Number(row.buying_price),
        selling_price: Number(row.selling_price),
        discount_percent: Number(row.discount_percent ?? 0),
        discount_source: row.discount_source ?? null,
      })
      const imgs = (row.images ?? []) as Array<{ image_path: string; position: number }>
      const primary = imgs.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0]
      return {
        id: row.id,
        name: row.name, // * { fr, en } — client localizes
        reference: row.reference,
        club_id: row.club_id,
        club_name: row.club?.name ?? null,
        club_accent: row.club?.accent_color ?? null,
        category: row.category ?? null,
        image_path: primary?.image_path ?? null,
        unit_price: pricing.unit_price_paid,
        original_price: Number(row.selling_price),
        discount_percent: Number(row.discount_percent ?? 0),
        is_on_clearance: !!row.is_on_clearance,
      }
    })

    const total = count ?? 0
    return jsonResponse({
      results,
      total,
      page,
      page_size: pageSize,
      has_more: from + results.length < total,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[search-products]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
