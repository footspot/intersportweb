// * admin-fund — manual credit / debit on a club's cagnotte. Admin only.
// * The amount is always stored as a signed value in fund_transactions.amount
// * (positive = credit, negative = debit). The sync_fund_balance trigger
// * keeps clubs.fund_balance up to date.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'

type TxType = 'manual_credit' | 'manual_debit'

interface FundPayload {
  club_id: string
  type: TxType
  amount: number            // * always positive; sign is derived from `type`
  reason: string
  reference?: string | null
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  const guard = await verifyAdmin(req)
  if (guard instanceof Response) return guard

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, { status: 405 })
  }

  const sb = serviceClient()

  try {
    const body = (await req.json()) as FundPayload
    if (!body?.club_id) return jsonResponse({ error: 'club_id required' }, { status: 400 })
    if (body.type !== 'manual_credit' && body.type !== 'manual_debit') {
      return jsonResponse({ error: 'type must be manual_credit or manual_debit' }, { status: 400 })
    }
    const amount = Number(body.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      return jsonResponse({ error: 'amount must be a positive number' }, { status: 400 })
    }
    if (!body.reason?.trim()) {
      return jsonResponse({ error: 'reason required' }, { status: 400 })
    }

    const signed = body.type === 'manual_credit' ? amount : -amount

    const { data: tx, error: txErr } = await sb
      .from('fund_transactions')
      .insert({
        club_id: body.club_id,
        type: body.type,
        amount: signed,
        reason: body.reason.trim(),
        reference: body.reference?.trim() || null,
        created_by: guard.id,
      })
      .select()
      .single()
    if (txErr) throw txErr

    const { data: club, error: cErr } = await sb
      .from('clubs')
      .select('id, fund_balance')
      .eq('id', body.club_id)
      .single()
    if (cErr) throw cErr

    return jsonResponse({
      transaction: tx,
      club_id: club.id,
      new_balance: Number(club.fund_balance),
    }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-fund]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
