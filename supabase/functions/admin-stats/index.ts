// * admin-stats — pre-aggregates analytics for the /admin/stats page.
// * One POST endpoint with filter body; returns a JSON blob with all chart data
// * so the client never handles raw rows. Admin only.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'

type Period = '7d' | '30d' | '90d' | '12m' | 'custom'
type Granularity = 'day' | 'month'

interface StatsFilters {
  period?: Period
  // * Custom range bounds (period === 'custom'), 'YYYY-MM-DD' inclusive.
  date_from?: string | null
  date_to?: string | null
  club_id?: string | null
  category?: string | null
  product_id?: string | null
  size?: string | null
  reference?: string | null
}

function parseDay(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

// * Resolve the [since, until] window + chart granularity for a filter set.
// * Custom ranges longer than 120 days switch to monthly buckets so the
// * series stays readable; an invalid/incomplete custom range falls back to 30d.
function resolveRange(filters: StatsFilters): { since: Date; until: Date; granularity: Granularity } {
  const now = new Date()

  if (filters.period === 'custom') {
    let since = parseDay(filters.date_from)
    let until = parseDay(filters.date_to)
    if (since && until) {
      if (since > until) [since, until] = [until, since]
      until.setHours(23, 59, 59, 999)
      const days = (until.getTime() - since.getTime()) / 86_400_000
      return { since, until, granularity: days > 120 ? 'month' : 'day' }
    }
  }

  const d = new Date(now)
  switch (filters.period ?? '30d') {
    case '7d':
      d.setDate(now.getDate() - 7)
      break
    case '90d':
      d.setDate(now.getDate() - 90)
      break
    case '12m':
      d.setMonth(now.getMonth() - 12)
      break
    default:
      d.setDate(now.getDate() - 30)
  }
  return { since: d, until: now, granularity: filters.period === '12m' ? 'month' : 'day' }
}

function bucketLabel(d: Date, granularity: Granularity): string {
  if (granularity === 'month') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function enumerateBuckets(since: Date, until: Date, granularity: Granularity): string[] {
  const out: string[] = []
  const cursor = new Date(since)
  if (granularity === 'month') {
    cursor.setDate(1)
    while (cursor <= until) {
      out.push(bucketLabel(cursor, granularity))
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else {
    cursor.setHours(0, 0, 0, 0)
    while (cursor <= until) {
      out.push(bucketLabel(cursor, granularity))
      cursor.setDate(cursor.getDate() + 1)
    }
  }
  return out
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
    const filters = (await req.json().catch(() => ({}))) as StatsFilters
    const period: Period = filters.period ?? '30d'
    const { since, until, granularity } = resolveRange(filters)

    // * Pull orders in range (paid + partially_refunded + shipped + delivered count as revenue)
    const orderQuery = sb
      .from('orders')
      .select('id, club_id, total, subtotal, status, paid_at, created_at')
      .gte('created_at', since.toISOString())
      .lte('created_at', until.toISOString())
      .in('status', ['paid', 'partially_refunded', 'shipped', 'delivered', 'refunded'])
    // * The club filter is applied per item (via products.club_id) rather than
    // * on orders.club_id, so mixed-club orders still count toward each club.
    const { data: orders, error: oErr } = await orderQuery
    if (oErr) throw oErr

    const orderIds = (orders ?? []).map((o) => o.id)

    // * Pull items for those orders. Join product for reference/category/fund breakdown.
    let itemQuery = sb
      .from('order_items')
      .select(
        'id, order_id, product_id, quantity, size, unit_price_paid, buying_price_snapshot, fund_credit_snapshot, status, product:products(name, reference, category, club_id)',
      )
      .in('order_id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'])
    const { data: items, error: iErr } = await itemQuery
    if (iErr) throw iErr

    // * Filter items further by category/product/reference (post-fetch — fine for our scale).
    // * Size filter applies last so we can compute `available_sizes` from the
    // * pre-size pool — the size dropdown should keep all options visible
    // * even after the user picks one.
    const preSizeItems = (items ?? []).filter((it: any) => {
      if (it.status === 'refunded_oos') return false
      if (filters.club_id && it.product?.club_id !== filters.club_id) return false
      if (filters.category && it.product?.category !== filters.category) return false
      if (filters.product_id && it.product_id !== filters.product_id) return false
      if (filters.reference && !String(it.product?.reference ?? '').toLowerCase().includes(filters.reference.toLowerCase())) return false
      return true
    })

    const availableSizes = Array.from(new Set(preSizeItems.map((it: any) => it.size).filter(Boolean))).sort()

    const filteredItems = filters.size
      ? preSizeItems.filter((it: any) => it.size === filters.size)
      : preSizeItems

    // * Aggregations
    let revenue = 0
    let margin = 0
    const revenueByBucket = new Map<string, { revenue: number; margin: number }>()
    const revenueByClub = new Map<string, number>()
    const qtyBySize = new Map<string | null, number>()
    const bestSellers = new Map<
      string,
      { product_id: string; name: any; reference: string; club_id: string; qty: number; revenue: number; margin: number }
    >()

    const buckets = enumerateBuckets(since, until, granularity)
    for (const b of buckets) revenueByBucket.set(b, { revenue: 0, margin: 0 })

    const orderById = new Map<string, any>()
    for (const o of orders ?? []) orderById.set(o.id, o)

    for (const it of filteredItems) {
      const o = orderById.get(it.order_id)
      if (!o) continue

      const lineRevenue = Number(it.unit_price_paid) * it.quantity
      const lineMargin = (Number(it.unit_price_paid) - Number(it.buying_price_snapshot)) * it.quantity

      revenue += lineRevenue
      margin += lineMargin

      const bucket = bucketLabel(new Date(o.created_at), granularity)
      const existing = revenueByBucket.get(bucket)
      if (existing) {
        existing.revenue += lineRevenue
        existing.margin += lineMargin
      }

      // * Attribute revenue to the item's own club (orders.club_id is NULL for
      // * mixed-club orders, so it can't be used for per-club aggregation).
      const itemClubId = it.product?.club_id ?? o.club_id
      if (itemClubId) {
        revenueByClub.set(itemClubId, (revenueByClub.get(itemClubId) ?? 0) + lineRevenue)
      }

      // * One-size products have no size ('' or null) — collapse both into a single null bucket
      const sizeKey = it.size?.trim() || null
      qtyBySize.set(sizeKey, (qtyBySize.get(sizeKey) ?? 0) + it.quantity)

      const key = it.product_id
      const prev = bestSellers.get(key)
      if (prev) {
        prev.qty += it.quantity
        prev.revenue += lineRevenue
        prev.margin += lineMargin
      } else {
        bestSellers.set(key, {
          product_id: key,
          name: it.product?.name ?? { fr: '?', en: '?' },
          reference: it.product?.reference ?? '',
          club_id: it.product?.club_id ?? o.club_id,
          qty: it.quantity,
          revenue: lineRevenue,
          margin: lineMargin,
        })
      }
    }

    // * Resolve club + sport names for the donut and best sellers
    const clubIds = Array.from(
      new Set([
        ...Array.from(revenueByClub.keys()),
        ...Array.from(bestSellers.values()).map((b) => b.club_id).filter(Boolean),
      ]),
    )
    let clubsMap = new Map<string, { id: string; name: string; sport_id: string }>()
    let sportsMap = new Map<string, { id: string; name: any }>()
    if (clubIds.length > 0) {
      const { data: clubs } = await sb.from('clubs').select('id, name, sport_id').in('id', clubIds)
      for (const c of clubs ?? []) clubsMap.set(c.id, c as any)
      const sportIds = Array.from(new Set((clubs ?? []).map((c) => c.sport_id)))
      if (sportIds.length) {
        const { data: sports } = await sb.from('sports').select('id, name').in('id', sportIds)
        for (const s of sports ?? []) sportsMap.set(s.id, s as any)
      }
    }

    // * Revenue by sport (donut)
    const revenueBySport = new Map<string, number>()
    for (const [clubId, rev] of revenueByClub) {
      const club = clubsMap.get(clubId)
      const sport = club ? sportsMap.get(club.sport_id) : null
      const label = sport?.name?.fr ?? sport?.name?.en ?? '—'
      revenueBySport.set(label, (revenueBySport.get(label) ?? 0) + rev)
    }

    // * Total orders + average basket (unique order count in the filtered window)
    const ordersCounted = new Set<string>(filteredItems.map((i: any) => i.order_id))
    const orderCount = ordersCounted.size
    const averageBasket = orderCount > 0 ? revenue / orderCount : 0

    // * Active products + total fund balance (filter-free — these are global KPIs)
    const { count: productCount } = await sb
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('is_visible', true)
    const { data: clubFunds } = await sb.from('clubs').select('fund_balance')
    const totalFund = (clubFunds ?? []).reduce((s: number, c: any) => s + Number(c.fund_balance ?? 0), 0)

    const bestSellersList = Array.from(bestSellers.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
      .map((b) => ({
        ...b,
        club_name: clubsMap.get(b.club_id)?.name ?? null,
      }))

    return jsonResponse({
      filters: {
        period,
        date_from: filters.date_from ?? null,
        date_to: filters.date_to ?? null,
        club_id: filters.club_id ?? null,
        category: filters.category ?? null,
        product_id: filters.product_id ?? null,
        size: filters.size ?? null,
        reference: filters.reference ?? null,
      },
      available_sizes: availableSizes,
      kpis: {
        revenue: Number(revenue.toFixed(2)),
        margin: Number(margin.toFixed(2)),
        orders: orderCount,
        average_basket: Number(averageBasket.toFixed(2)),
        active_products: productCount ?? 0,
        total_fund: Number(totalFund.toFixed(2)),
      },
      revenue_series: Array.from(revenueByBucket.entries()).map(([bucket, v]) => ({
        bucket,
        revenue: Number(v.revenue.toFixed(2)),
        margin: Number(v.margin.toFixed(2)),
      })),
      revenue_by_sport: Array.from(revenueBySport.entries()).map(([label, value]) => ({
        label,
        value: Number(value.toFixed(2)),
      })),
      size_breakdown: Array.from(qtyBySize.entries())
        .map(([size, qty]) => ({ size, qty }))
        .sort((a, b) => b.qty - a.qty),
      best_sellers: bestSellersList,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[admin-stats]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
