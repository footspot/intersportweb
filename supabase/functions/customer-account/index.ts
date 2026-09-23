// * customer-account — RGPD self-service for a signed-in STOREFRONT customer.
// *
// *   GET  ?export=1   art. 20 — portability: the caller's own data as JSON.
// *   DELETE           art. 17 — erasure: deletes the account.
// *
// * Every action works strictly on the caller's own verified identity taken
// * from the JWT. No id, e-mail or filter is ever read from the request body,
// * so this endpoint cannot be pointed at somebody else's data.
// *
// * ! Identity model (see 20260626120100_customer_self_accounts.sql): storefront
// * ! orders are ALWAYS guest orders — the orders table carries no user_id column
// * ! at all, and the link to a customer is `lower(orders.guest_email) =
// * ! lower(jwt.email)`. So deleting the account does NOT orphan any order, and
// * ! there is nothing to "detach" first.
// *
// * ! Erasure vs accounting: art. 17.3.b exempts processing required by a legal
// * ! obligation. Invoices must be kept 10 years (art. L123-22 C. com.), so we do
// * ! NOT wipe recent orders. Orders already past the retention window are
// * ! anonymised by calling rgpd_anonymise_orders() — the SAME SQL function the
// * ! weekly sweep runs, so the window has exactly one definition — and the UI
// * ! tells the customer plainly that invoices are retained.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, userClient } from '../_shared/supabase.ts'

interface Caller {
  id: string
  email: string
}

// * Local guard rather than _shared/auth.ts: that module only knows admin and
// * back-office roles, and its verifyAdmin/verifyBackoffice reject the very
// * sessions we need here (customers sign in by magic link, so their `amr`
// * carries no password method). Keeping it local also avoids editing a file
// * bundled into ~30 other functions for a single new caller type.
async function verifyCustomer(req: Request): Promise<Caller | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Missing auth header' }, { status: 401 })

  const { data: userRes, error: userErr } = await userClient(authHeader).auth.getUser()
  if (userErr || !userRes?.user) {
    return jsonResponse({ error: 'Invalid session' }, { status: 401 })
  }

  const sb = serviceClient()
  const { data: profile, error: pErr } = await sb
    .from('profiles')
    .select('id, email, role, active')
    .eq('id', userRes.user.id)
    .single()
  if (pErr || !profile) return jsonResponse({ error: 'Profile not found' }, { status: 401 })
  if (!profile.active) return jsonResponse({ error: 'Account disabled' }, { status: 403 })

  // ! Customers only. A back-office account must never self-delete through the
  // ! storefront: staff accounts are managed in /admin/users, and letting an
  // ! admin erase themselves here would also bypass the password + 2FA gate.
  if (profile.role !== 'customer') {
    return jsonResponse({ error: 'customer_role_required' }, { status: 403 })
  }

  // * The e-mail on the verified auth user is the identity that links orders.
  const email = userRes.user.email ?? profile.email
  if (!email) return jsonResponse({ error: 'no_email_on_account' }, { status: 400 })

  return { id: profile.id, email }
}

const EXPORT_ORDER_COLS =
  'id, order_number, status, created_at, paid_at, shipped_at, delivered_at, total, subtotal, shipping_cost, promo_discount, prepaid_credit, delivery_method, shipping_address, guest_email, guest_first_name, guest_last_name'

const EXPORT_ITEM_COLS =
  'id, order_id, quantity, unit_price_paid, size, secondary_size, color, flocking_name, flocking_initial, flocking_number'

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const caller = await verifyCustomer(req)
  if (caller instanceof Response) return caller

  const sb = serviceClient()
  const email = caller.email.toLowerCase()

  try {
    // ───────────────────────── GET ?export=1 — portability ─────────────────────
    if (req.method === 'GET') {
      const { data: profile } = await sb
        .from('profiles')
        .select('id, email, full_name, created_at')
        .eq('id', caller.id)
        .single()

      const { data: orders, error: oErr } = await sb
        .from('orders')
        .select(EXPORT_ORDER_COLS)
        .ilike('guest_email', email)
        .order('created_at', { ascending: false })
      if (oErr) throw oErr

      const orderIds = (orders ?? []).map((o) => (o as { id: string }).id)
      let items: unknown[] = []
      if (orderIds.length) {
        const { data, error } = await sb
          .from('order_items')
          .select(EXPORT_ITEM_COLS)
          .in('order_id', orderIds)
        if (error) throw error
        items = data ?? []
      }

      const { data: favorites } = await sb
        .from('favorites')
        .select('product_id, created_at')
        .eq('user_id', caller.id)

      // * Contact messages are matched on e-mail like orders are.
      const { data: messages } = await sb
        .from('contact_messages')
        .select('subject, message, created_at')
        .ilike('email', email)
        .order('created_at', { ascending: false })

      const payload = {
        _export: {
          generated_at: new Date().toISOString(),
          source: 'www.intersportclubidf.com',
          note:
            "Export de vos données personnelles (RGPD art. 20). Les factures liées à vos commandes sont conservées 10 ans au titre de l'article L123-22 du Code de commerce.",
        },
        profile: profile ?? null,
        orders: orders ?? [],
        order_items: items,
        favorites: favorites ?? [],
        contact_messages: messages ?? [],
      }

      return jsonResponse(payload, {
        headers: {
          'Content-Disposition': 'attachment; filename="mes-donnees-intersport.json"',
        },
      })
    }

    // ─────────────────────────── DELETE — erasure ──────────────────────────────
    if (req.method === 'DELETE') {
      // ! Do NOT re-implement the retention window here. It is defined once, in
      // ! SQL (20260923000004_rgpd_retention_single_window.sql), and reached over
      // ! RPC. An earlier version of this handler filtered on `created_at`, which
      // ! disagreed with the SQL sweep's COALESCE(delivered_at, …) and would have
      // ! anonymised orders still inside their legal retention obligation — the
      // ! clock runs from DELIVERY (C. consommation L.213-1 / D.213-2).
      // *
      // * Past the window the identity is pseudonymised, not deleted: guest_email
      // * takes an undeliverable RFC 2606 `.invalid` address because
      // * `orders_guest_email_check CHECK (guest_email IS NOT NULL)` forbids NULL.
      // * Orders still inside the window keep their identity and are reported
      // * below as `retained_orders`.
      const { data: anonymisedOrders, error: sErr } = await sb.rpc('rgpd_anonymise_orders', {
        p_email: email,
      })
      if (sErr) throw sErr

      // * favorites cascade on profiles, but delete explicitly so the row count
      // * is deterministic even if the FK is ever changed.
      await sb.from('favorites').delete().eq('user_id', caller.id)

      // * Deleting the auth user cascades to profiles.
      const { error: dErr } = await sb.auth.admin.deleteUser(caller.id)
      if (dErr) throw dErr

      const { count: keptCount } = await sb
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .ilike('guest_email', email)

      return jsonResponse({
        ok: true,
        anonymised_orders: (anonymisedOrders as number | null) ?? 0,
        // * Orders still carrying the identity because invoices are legally
        // * retained — surfaced so the UI can be honest about what remains.
        retained_orders: keptCount ?? 0,
      })
    }

    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[customer-account]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
