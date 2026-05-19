// * refund-order — manual partial-line refund initiated by admin/employee.
// *
// * Flow:
// *   1. Compute the refund amount (sum of unit_price_paid × quantity over the
// *      selected lines).
// *   2. For `card` / `paypal` orders: POST Lyra Transaction/CancelOrRefund
// *      against the stored payment_id. If Lyra rejects, abort with no DB
// *      change. The IPN that follows will independently set orders.status
// *      to 'refunded' if it was a full refund.
// *   3. Call `refund_order_lines` RPC (reverses fund, optionally restocks).
// *   4. Insert a `refunds` row + dispatch the refunded email.
// *
// *   Bank-transfer orders skip step 2 (no remote processor); the admin is
// *   expected to issue the wire refund manually in the bank's portal.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyBackoffice } from '../_shared/auth.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'

async function callInternal(name: string, body: Record<string, unknown>): Promise<void> {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRole = serviceRoleKey()
  if (!url || !serviceRole) return
  await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Internal-Call': serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
    body: JSON.stringify(body),
  }).catch((err) => console.error(`[refund-order] internal ${name} failed`, err))
}

interface RefundPayload {
  order_id: string
  item_ids: string[]
  restock?: boolean
  reason?: string
}

async function lyraRefund(args: {
  paymentId: string
  amountCents: number
}): Promise<{ ok: true; transactionUuid: string } | { ok: false; error: string }> {
  const endpoint = Deno.env.get('SYSTEMPAY_ENDPOINT')
  const username = Deno.env.get('SYSTEMPAY_USERNAME')
  const password = Deno.env.get('SYSTEMPAY_PASSWORD')
  if (!endpoint || !username || !password) return { ok: false, error: 'systempay_not_configured' }
  const url = `https://${endpoint.replace(/^https?:\/\//, '')}/api-payment/V4/Transaction/CancelOrRefund`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${username}:${password}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      uuid: args.paymentId,
      amount: args.amountCents,
      currency: 'EUR',
      resolutionMode: 'AUTO',
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.status === 'ERROR') {
    return { ok: false, error: data?.answer?.errorMessage ?? `lyra_${res.status}` }
  }
  const newUuid = data?.answer?.transactions?.[0]?.uuid ?? args.paymentId
  return { ok: true, transactionUuid: newUuid }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const guard = await verifyBackoffice(req)
  if (guard instanceof Response) return guard

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const sb = serviceClient()

  try {
    const body = (await req.json()) as RefundPayload
    if (!body?.order_id) return jsonResponse({ error: 'order_id required' }, { status: 400 })
    if (!Array.isArray(body?.item_ids) || body.item_ids.length === 0) {
      return jsonResponse({ error: 'item_ids required' }, { status: 400 })
    }

    const { data: order, error: oErr } = await sb
      .from('orders')
      .select('id, payment_method, payment_id, status')
      .eq('id', body.order_id)
      .single()
    if (oErr || !order) return jsonResponse({ error: 'order_not_found' }, { status: 404 })

    // * Compute refund amount from the targeted items so we can show it to
    // * Lyra. We re-query to avoid trusting client-supplied totals.
    const { data: itemsToRefund } = await sb
      .from('order_items')
      .select('id, unit_price_paid, quantity, status')
      .eq('order_id', body.order_id)
      .in('id', body.item_ids)
    const refundCents = (itemsToRefund ?? [])
      .filter((it: any) => it.status !== 'refunded_oos')
      .reduce(
        (sum: number, it: any) =>
          sum + Math.round(Number(it.unit_price_paid) * 100) * Number(it.quantity),
        0,
      )
    if (refundCents <= 0) {
      return jsonResponse({ ok: true, refunded: 0, note: 'no refundable lines' })
    }

    // * Call Lyra first when applicable. If it fails, we don't touch DB.
    if ((order.payment_method === 'card' || order.payment_method === 'paypal') && order.payment_id) {
      const lr = await lyraRefund({ paymentId: order.payment_id, amountCents: refundCents })
      if (!lr.ok) {
        return jsonResponse({ error: 'lyra_refund_failed', detail: lr.error }, { status: 502 })
      }
    }

    const { data: rpcRows, error: rpcErr } = await sb.rpc('refund_order_lines', {
      p_order_id: body.order_id,
      p_item_ids: body.item_ids,
      p_restock: !!body.restock,
      p_actor_id: guard.id,
    })
    if (rpcErr) throw rpcErr

    const totalRefund = (rpcRows ?? []).reduce(
      (sum: number, r: { refund_amount: number }) => sum + Number(r.refund_amount ?? 0),
      0,
    )

    const { data: refundRow, error: refundErr } = await sb
      .from('refunds')
      .insert({
        order_id: body.order_id,
        amount: totalRefund,
        reason: body.reason?.trim() || 'manual',
        processor_ref: order.payment_id ?? null,
        created_by: guard.id,
      })
      .select()
      .single()
    if (refundErr) throw refundErr

    await callInternal('send-order-email', { order_id: body.order_id, event: 'refunded' })

    return jsonResponse({
      ok: true,
      refund: refundRow,
      refunded: totalRefund,
      lines: rpcRows,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[refund-order]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
