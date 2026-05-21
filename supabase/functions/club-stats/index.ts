// * club-stats — sales analytics for Footspot's "Statistiques" tab
// * (caller: Footspot's intersport-fetch-stats). Footspot relays the success
// * body verbatim to the UI, so the shape below is contractual
// * (SHOP_PERSONALIZATION_GUIDE.md §"club-stats").
// *
// * Auth: HMAC + per-club Bearer; intersport_club_id must match the Bearer.
// * All time bucketing is UTC. Margin = the club's fund credit per item
// * (fund_credit_snapshot) — Intersport's margin is never counted here.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { verifyFootspotClubAuth } from '../_shared/footspot/inbound.ts'

type Period = 'current_week' | 'current_month' | 'current_season' | 'all_time'
const PERIODS: Period[] = ['current_week', 'current_month', 'current_season', 'all_time']

const FR_MONTHS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]
const FR_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const DAY_MS = 86_400_000

function fail(status: number, error: string, message: string) {
  return jsonResponse({ ok: false, error, message }, { status })
}

// * Monday 00:00 UTC of the current week.
function currentWeekStart(): Date {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const mondayOffset = (d.getUTCDay() + 6) % 7 // * 0 = Monday … 6 = Sunday
  d.setUTCDate(d.getUTCDate() - mondayOffset)
  return d
}

// * Start of the requested period (null = all time). The sports season runs
// * August → July (FOOTSPOT_INTEGRATION.md §"Season calculation").
function periodStart(period: Period): Date | null {
  const now = new Date()
  if (period === 'all_time') return null
  if (period === 'current_week') return currentWeekStart()
  if (period === 'current_month') {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  }
  const seasonStartYear = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return new Date(Date.UTC(seasonStartYear, 7, 1))
}

function frDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${FR_MONTHS[d.getUTCMonth()]}`
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'POST only')

  const auth = await verifyFootspotClubAuth(req)
  if (!auth.ok) return fail(auth.status, auth.error, 'Authentication failed')

  let payload: { intersport_club_id?: unknown; period?: unknown }
  try {
    payload = JSON.parse(auth.body)
  } catch {
    return fail(400, 'invalid_json', 'Request body is not valid JSON')
  }
  if (payload.intersport_club_id !== auth.clubId) {
    return fail(403, 'forbidden_cross_club',
      'intersport_club_id does not match the authenticated club')
  }
  const period = payload.period as Period
  if (!PERIODS.includes(period)) {
    return fail(422, 'invalid_period', `period must be one of: ${PERIODS.join(', ')}`)
  }

  const sb = serviceClient()

  const weekStart = currentWeekStart()
  const weekEndMs = weekStart.getTime() + 7 * DAY_MS
  const pStart = periodStart(period)
  const pStartMs = pStart ? pStart.getTime() : -Infinity
  // * One fetch covers both the period KPIs and the current-week chart.
  const effectiveSince = pStart === null
    ? null
    : (pStart.getTime() < weekStart.getTime() ? pStart : weekStart)

  // * Paid orders — paid_at is the sale timestamp and the period anchor.
  let oq = sb
    .from('orders')
    .select('id, paid_at')
    .eq('club_id', auth.clubId)
    .not('paid_at', 'is', null)
  if (effectiveSince) oq = oq.gte('paid_at', effectiveSince.toISOString())
  const { data: orders, error: oErr } = await oq
  if (oErr) {
    console.error('[club-stats] order lookup', oErr)
    return fail(500, 'lookup_failed', oErr.message)
  }

  const orderPaidAt = new Map<string, string>()
  for (const o of orders ?? []) orderPaidAt.set(o.id, o.paid_at)
  const orderIds = [...orderPaidAt.keys()]

  let items: Record<string, any>[] = []
  if (orderIds.length) {
    const { data, error: iErr } = await sb
      .from('order_items')
      .select('order_id, quantity, unit_price_paid, fund_credit_snapshot, status, ' +
              'product:products(reference, name)')
      .in('order_id', orderIds)
    if (iErr) {
      console.error('[club-stats] item lookup', iErr)
      return fail(500, 'lookup_failed', iErr.message)
    }
    items = data ?? []
  }

  // * Aggregate items into period KPIs + current-week chart + top products.
  let revenue = 0
  let margin = 0
  const weekDays = FR_DAYS.map((day) => ({ day, revenue: 0, margin: 0 }))
  const topMap = new Map<string, { reference: string; name: string; units: number; revenue: number; margin: number }>()

  for (const it of items) {
    if (it.status === 'refunded_oos') continue
    const paidAt = orderPaidAt.get(it.order_id)
    if (!paidAt) continue
    const t = new Date(paidAt).getTime()
    const lineRevenue = Number(it.unit_price_paid) * it.quantity
    const lineMargin = Number(it.fund_credit_snapshot) * it.quantity

    if (t >= pStartMs) {
      revenue += lineRevenue
      margin += lineMargin
      const ref = it.product?.reference ?? '—'
      const tp = topMap.get(ref) ??
        { reference: ref, name: it.product?.name?.fr ?? it.product?.name?.en ?? '', units: 0, revenue: 0, margin: 0 }
      tp.units += it.quantity
      tp.revenue += lineRevenue
      tp.margin += lineMargin
      topMap.set(ref, tp)
    }

    if (t >= weekStart.getTime() && t < weekEndMs) {
      const dayIdx = Math.floor((t - weekStart.getTime()) / DAY_MS)
      if (dayIdx >= 0 && dayIdx < 7) {
        weekDays[dayIdx].revenue += lineRevenue
        weekDays[dayIdx].margin += lineMargin
      }
    }
  }

  const salesCount = (orders ?? []).filter((o) => new Date(o.paid_at).getTime() >= pStartMs).length

  // * Pending = a now-snapshot of in-flight orders awaiting fulfilment.
  const { count: pendingCount } = await sb
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', auth.clubId)
    .in('status', ['paid', 'shipped', 'awaiting_pickup'])

  // * Cagnotte — fund_balance is the live balance; fund_transactions over the
  // * period give the net delta + the recent movement list.
  const { data: club } = await sb
    .from('clubs')
    .select('fund_balance')
    .eq('id', auth.clubId)
    .maybeSingle()

  let ftq = sb
    .from('fund_transactions')
    .select('amount, reason, created_at')
    .eq('club_id', auth.clubId)
    .order('created_at', { ascending: false })
  if (pStart) ftq = ftq.gte('created_at', pStart.toISOString())
  const { data: funds } = await ftq

  let recentDelta = 0
  for (const f of funds ?? []) recentDelta += Number(f.amount)
  const transactions = (funds ?? []).slice(0, 50).map((f) => ({
    date: frDate(f.created_at),
    label: f.reason ?? '',
    amount_cents: Math.round(Number(f.amount) * 100), // * sign preserved (debit = negative)
  }))

  const topProducts = [...topMap.values()]
    .sort((a, b) => b.units - a.units)
    .slice(0, 5)
    .map((t) => ({
      product_reference: t.reference,
      name: t.name,
      units_sold: t.units,
      margin_cents: Math.round(t.margin * 100),
      margin_pct: t.revenue > 0 ? Math.floor((t.margin / t.revenue) * 100) : 0,
    }))

  return jsonResponse({
    cagnotte_balance_cents: Math.round(Number(club?.fund_balance ?? 0) * 100),
    cagnotte_recent_delta_cents: Math.round(recentDelta * 100),
    cagnotte_transactions: transactions,
    kpis: {
      sales_count: salesCount,
      revenue_cents: Math.round(revenue * 100),
      pending_orders_count: pendingCount ?? 0,
      gross_margin_cents: Math.round(margin * 100),
    },
    weekly_chart: weekDays.map((d) => ({
      day: d.day,
      revenue_cents: Math.round(d.revenue * 100),
      margin_cents: Math.round(d.margin * 100),
    })),
    top_products: topProducts,
  })
})
