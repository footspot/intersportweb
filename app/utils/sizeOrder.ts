// * Canonical apparel-size ordering (4XS → 5XL) used to sort size variants for
// * display and to power the "auto sort" button in the admin variant editor.
// * Must stay in sync with the SQL backfill in the `variant_position` migration.
const NAMED_RANK: Record<string, number> = {
  '4XS': 1, 'XXXXS': 1,
  '3XS': 2, 'XXXS': 2,
  '2XS': 3, 'XXS': 3,
  'XS': 4,
  'S': 5,
  'M': 6,
  'L': 7,
  'XL': 8,
  '2XL': 9, 'XXL': 9,
  '3XL': 10, 'XXXL': 10,
  '4XL': 11, 'XXXXL': 11,
  '5XL': 12,
}

export function sizeRank(size: string): number {
  return NAMED_RANK[size.trim().toUpperCase()] ?? 100
}

// * Named sizes first (XXS < XS < … < XXL), then numeric-leading sizes
// * ascending (36, 30-34, 6 ans…), then locale-aware alphabetical.
export function compareSizes(a: string, b: string): number {
  const ra = sizeRank(a)
  const rb = sizeRank(b)
  if (ra !== rb) return ra - rb
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  const ha = Number.isFinite(na)
  const hb = Number.isFinite(nb)
  if (ha && hb && na !== nb) return na - nb
  if (ha !== hb) return ha ? -1 : 1
  return a.localeCompare(b, 'fr', { sensitivity: 'base', numeric: true })
}

// * Display sort: admin-defined position first, canonical size order as the
// * tie-breaker (covers rows saved before positions existed).
export function sortVariantsForDisplay<T extends { size: string; position?: number | null }>(
  list: T[] | null | undefined,
): T[] {
  return [...(list ?? [])].sort(
    (a, b) => (a.position ?? 0) - (b.position ?? 0) || compareSizes(a.size, b.size),
  )
}
