// * admin-featured-products — manages the hand-picked "Les bons plans du moment"
// * roster shown on the home page. Admin only. Public read happens directly via
// * RLS, so this function only handles mutations.
// *
// *   POST   /admin-featured-products            body { product_id }  → add
// *   POST   /admin-featured-products/reorder     body { order: [{ id, sort_order }] }
// *   DELETE /admin-featured-products?id=...                          → remove
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'

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

  try {
    // * Reorder — persist a new sort_order for each row.
    if (req.method === 'POST' && action === 'reorder') {
      const body = (await req.json()) as ReorderPayload
      if (!Array.isArray(body?.order)) {
        return jsonResponse({ error: 'Invalid order payload' }, { status: 400 })
      }
      const updates = body.order.map(({ id, sort_order }) =>
        sb.from('featured_products').update({ sort_order }).eq('id', id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
      return jsonResponse({ ok: true })
    }

    // * Add a product to the end of the roster.
    if (req.method === 'POST') {
      const body = (await req.json()) as { product_id?: string }
      if (!body?.product_id) {
        return jsonResponse({ error: 'product_id required' }, { status: 400 })
      }

      // * Append after the current max sort_order.
      const { data: last } = await sb
        .from('featured_products')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      const nextOrder = (last?.sort_order ?? -1) + 1

      const { data, error } = await sb
        .from('featured_products')
        .insert({ product_id: body.product_id, sort_order: nextOrder })
        .select()
        .single()
      if (error) {
        // * 23505 = unique violation → already featured.
        if ((error as { code?: string }).code === '23505') {
          return jsonResponse({ error: 'already_featured' }, { status: 409 })
        }
        throw error
      }
      return jsonResponse({ featured: data }, { status: 201 })
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return jsonResponse({ error: 'id required' }, { status: 400 })
      const { error } = await sb.from('featured_products').delete().eq('id', id)
      if (error) throw error
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-featured-products]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
