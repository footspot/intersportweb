// * rgpd-purge-worker — deletes dormant customer accounts.
// *
// * RGPD art. 5.1.e: a customer account is kept "until deletion, or 3 years
// * after the last activity" — the exact wording published on /confidentialite.
// * The two SQL jobs (rgpd_purge_contact_messages, rgpd_anonymise_old_orders)
// * cover tables; this worker exists only because deleting an account needs
// * auth.admin.deleteUser(), which SQL cannot call.
// *
// * Server-to-server only: authenticated with the X-Internal-Call header, same
// * pattern as colissimo-tracking-worker / footspot-retry-worker. Scheduled
// * weekly by 20260923000003_rgpd_purge_worker_schedule.sql.
// *
// * ! Deliberately conservative. An account is deleted ONLY when all of:
// * !   - role = 'customer'          (never a back-office account)
// * !   - created  > 3 years ago
// * !   - last sign-in > 3 years ago (or never signed in since creation)
// * !   - NO order under that e-mail in the last 3 years
// * ! Orders themselves are untouched here: they are guest rows keyed by
// * ! e-mail, and invoices must survive 10 years (art. L123-22 C. com.).
// * ! rgpd_anonymise_old_orders() strips their identity on its own schedule.
import { jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'

const THREE_YEARS_MS = 3 * 365 * 24 * 60 * 60 * 1000

// * Safety valve: if a bug ever widened the selection, cap the blast radius of
// * a single run. A legitimate backlog is drained over successive weeks.
const MAX_DELETIONS_PER_RUN = 200

Deno.serve(async (req) => {
  // * No CORS preflight: this endpoint is never called from a browser.
  const internalKey = req.headers.get('X-Internal-Call')
  const serviceRole = serviceRoleKey()
  if (!serviceRole || internalKey !== serviceRole) {
    return jsonResponse({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = serviceClient()
  const cutoffIso = new Date(Date.now() - THREE_YEARS_MS).toISOString()
  const dryRun = new URL(req.url).searchParams.get('dry_run') === '1'

  try {
    // * Candidate profiles: customers created before the cutoff.
    const { data: profiles, error: pErr } = await sb
      .from('profiles')
      .select('id, email, created_at')
      .eq('role', 'customer')
      .lt('created_at', cutoffIso)
      .limit(1000)
    if (pErr) throw pErr

    const deleted: string[] = []
    const skipped: Array<{ id: string; reason: string }> = []

    for (const p of (profiles ?? []) as Array<{ id: string; email: string | null; created_at: string }>) {
      if (deleted.length >= MAX_DELETIONS_PER_RUN) break

      // * Last sign-in lives on auth.users, not on profiles.
      const { data: authUser, error: aErr } = await sb.auth.admin.getUserById(p.id)
      if (aErr || !authUser?.user) {
        skipped.push({ id: p.id, reason: 'auth_user_missing' })
        continue
      }
      const lastSignIn = authUser.user.last_sign_in_at
      if (lastSignIn && new Date(lastSignIn).getTime() > Date.now() - THREE_YEARS_MS) {
        skipped.push({ id: p.id, reason: 'recent_sign_in' })
        continue
      }

      // * Any recent order means the relationship is still live, whatever the
      // * sign-in history says (guest checkout needs no login at all).
      const email = (p.email ?? authUser.user.email ?? '').toLowerCase()
      if (email) {
        const { count, error: oErr } = await sb
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .ilike('guest_email', email)
          .gt('created_at', cutoffIso)
        if (oErr) throw oErr
        if ((count ?? 0) > 0) {
          skipped.push({ id: p.id, reason: 'recent_order' })
          continue
        }
      }

      if (dryRun) {
        deleted.push(p.id)
        continue
      }

      await sb.from('favorites').delete().eq('user_id', p.id)
      const { error: dErr } = await sb.auth.admin.deleteUser(p.id)
      if (dErr) {
        skipped.push({ id: p.id, reason: `delete_failed: ${dErr.message}` })
        continue
      }
      deleted.push(p.id)
    }

    console.log('[rgpd-purge-worker]', {
      dry_run: dryRun,
      candidates: profiles?.length ?? 0,
      deleted: deleted.length,
      skipped: skipped.length,
    })

    return jsonResponse({
      ok: true,
      dry_run: dryRun,
      candidates: profiles?.length ?? 0,
      deleted: deleted.length,
      skipped: skipped.length,
      skipped_reasons: skipped.slice(0, 20),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[rgpd-purge-worker]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
