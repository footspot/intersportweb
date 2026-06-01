// * adjust-cagnotte — a Footspot club director credits/debits HIS OWN club's
// * cagnotte from inside Footspot (CAGNOTTE_ADJUST_GUIDE.md). The self-service
// * counterpart to the admin-only admin-fund: same signed-insert into
// * fund_transactions + the manual_credit / manual_debit types (so the admin
// * panel fund history renders these rows for free), but reached through the
// * Footspot inbound pipeline instead of an admin session, scoped to one club.
// *
// * Auth: HMAC + per-club Bearer (verifyFootspotClubAuth) — the Bearer resolves
// * to exactly one club; intersport_club_id must match it (else forbidden_cross_club).
// *
// * Two rules stricter than admin-fund, both deliberate for the club-facing path:
// *   1. Debits may not push the cagnotte below 0 (insufficient_balance).
// *   2. X-Idempotency-Key is de-duped — a replay returns the original row, so a
// *      director double-submit never double-books the movement.
// *
// * Amounts cross the wire in CENTS (Footspot's UI is cents-based); the ledger is
// * in EUROS — divide by 100 on the way in, multiply by 100 on the way out.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { verifyFootspotClubAuth } from '../_shared/footspot/inbound.ts'

const LABEL_MAX = 120

const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]

// * Same display string as club-stats's frDate(), so the row Footspot renders
// * here matches the one it reads back from club-stats.
function frDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${FR_MONTHS[d.getUTCMonth()]}`
}

function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return jsonResponse({ ok: false, error, message, ...extra }, { status })
}

// * cents (live euro balance) — matches the club-stats cagnotte contract.
function toCents(eur: number): number {
  return Math.round(Number(eur) * 100)
}

// * Human-readable euro string for the backoffice notification body, e.g.
// * "1290,00 €" — fr style (comma decimal), app default locale.
function eur(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`
}

// * Build the success envelope from a stored fund_transactions row + balance.
// * tx.amount is already signed (negative for a debit), so transaction.amount_cents
// * carries the same sign convention as club-stats.cagnotte_transactions[].amount_cents.
function ok(tx: { reason: string; amount: number; created_at: string }, balanceEur: number) {
  return jsonResponse({
    ok: true,
    new_balance_cents: toCents(balanceEur),
    transaction: {
      date: frDate(tx.created_at),
      label: tx.reason,
      amount_cents: toCents(tx.amount),
    },
  })
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'POST only')

  const auth = await verifyFootspotClubAuth(req)
  if (!auth.ok) return fail(auth.status, auth.error, 'Authentication failed')

  let payload: {
    intersport_club_id?: unknown
    direction?: unknown
    amount_cents?: unknown
    label?: unknown
  }
  try {
    payload = JSON.parse(auth.body)
  } catch {
    return fail(400, 'invalid_json', 'Request body is not valid JSON')
  }

  // * The Bearer already resolved the club — the body must agree (no cross-club).
  if (payload.intersport_club_id !== auth.clubId) {
    return fail(403, 'forbidden_cross_club',
      'intersport_club_id does not match the authenticated club')
  }

  // * Validate direction / amount / label.
  const direction = payload.direction
  if (direction !== 'credit' && direction !== 'debit') {
    return fail(422, 'bad_direction', "direction must be 'credit' or 'debit'")
  }
  const amountCents = payload.amount_cents
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    return fail(422, 'bad_amount', 'amount_cents must be a positive integer')
  }
  const label = typeof payload.label === 'string' ? payload.label.trim() : ''
  if (!label || label.length > LABEL_MAX || /[\r\n]/.test(label)) {
    return fail(422, 'bad_label', `label must be non-empty, <= ${LABEL_MAX} chars, no newlines`)
  }

  const sb = serviceClient()

  // * Idempotency — if this X-Idempotency-Key was already booked, return the
  // * original row instead of inserting a second one (double-submit guard).
  const { data: prior, error: priorErr } = await sb
    .from('fund_transactions')
    .select('amount, reason, created_at')
    .eq('idempotency_key', auth.idempotencyKey)
    .maybeSingle()
  if (priorErr) {
    console.error('[adjust-cagnotte] idempotency lookup', priorErr)
    return fail(500, 'lookup_failed', priorErr.message)
  }
  if (prior) {
    const { data: club } = await sb
      .from('clubs')
      .select('fund_balance')
      .eq('id', auth.clubId)
      .maybeSingle()
    return ok(prior, Number(club?.fund_balance ?? 0))
  }

  // * signed euros — credit adds, debit subtracts.
  const signedEur = (direction === 'credit' ? 1 : -1) * (amountCents / 100)

  // * Read the current balance to enforce the overdraft guard AND to confirm the
  // * Bearer's club row exists.
  const { data: clubBefore, error: cErr } = await sb
    .from('clubs')
    .select('name, fund_balance')
    .eq('id', auth.clubId)
    .maybeSingle()
  if (cErr) {
    console.error('[adjust-cagnotte] club lookup', cErr)
    return fail(500, 'lookup_failed', cErr.message)
  }
  if (!clubBefore) return fail(404, 'club_not_found', 'Club not found')

  const balanceBefore = Number(clubBefore.fund_balance)

  // * Overdraft guard (stricter than admin-fund): a director must not push the
  // * kitty negative. Footspot pre-checks client-side, but the server is final.
  if (direction === 'debit' && balanceBefore + signedEur < 0) {
    return fail(422, 'insufficient_balance',
      'Debit would push the cagnotte below zero',
      { balance_cents: toCents(balanceBefore) })
  }

  // * Insert the signed movement. The sync_fund_balance trigger updates
  // * clubs.fund_balance on insert — we re-read it afterwards.
  const { data: tx, error: txErr } = await sb
    .from('fund_transactions')
    .insert({
      club_id: auth.clubId,
      type: direction === 'credit' ? 'manual_credit' : 'manual_debit',
      amount: signedEur,
      reason: label,
      reference: null,
      // * No Intersport user behind a Footspot call — leave the admin author null
      // * and tag the row's origin via `source` for the fund-history UI.
      created_by: null,
      source: 'footspot',
      idempotency_key: auth.idempotencyKey,
    })
    .select('amount, reason, created_at')
    .single()
  if (txErr) {
    // * 23505 = unique_violation on idempotency_key — a concurrent replay won the
    // * race. Re-read the original row and return it (still idempotent).
    if ((txErr as { code?: string }).code === '23505') {
      const { data: raced } = await sb
        .from('fund_transactions')
        .select('amount, reason, created_at')
        .eq('idempotency_key', auth.idempotencyKey)
        .maybeSingle()
      const { data: club } = await sb
        .from('clubs')
        .select('fund_balance')
        .eq('id', auth.clubId)
        .maybeSingle()
      if (raced) return ok(raced, Number(club?.fund_balance ?? 0))
    }
    console.error('[adjust-cagnotte] insert', txErr)
    return fail(500, 'insert_failed', txErr.message)
  }

  // * Re-read the post-trigger balance.
  const { data: clubAfter } = await sb
    .from('clubs')
    .select('fund_balance')
    .eq('id', auth.clubId)
    .maybeSingle()
  const balanceAfter = Number(clubAfter?.fund_balance ?? balanceBefore + signedEur)

  // * Alert the backoffice live (bell + toast) that a director moved the
  // * cagnotte from Footspot. Only on a genuinely new insert — an idempotent
  // * replay above returns early and never re-notifies. Best-effort: a failed
  // * notification must not fail the (already-committed) movement.
  try {
    await sb.rpc('notify_backoffice', {
      p_kind: direction === 'credit' ? 'footspot_cagnotte_credited' : 'footspot_cagnotte_debited',
      p_payload: {
        club_id: auth.clubId,
        club_name: clubBefore.name,
        amount: eur(amountCents),
        balance: eur(toCents(balanceAfter)),
        label,
      },
    })
  } catch (notifyErr) {
    console.error('[adjust-cagnotte] notify_backoffice', notifyErr)
  }

  return ok(tx, balanceAfter)
})
