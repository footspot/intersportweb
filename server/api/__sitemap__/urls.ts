// * Dynamic sitemap source for @nuxtjs/sitemap — emits one entry per visible
// * product. Runs at prerender time (nuxt generate) and on the server.
// * Reads Supabase via the public REST endpoint with the anon key; any failure
// * degrades to an empty list so a transient DB hiccup never breaks the build.
import { defineSitemapEventHandler } from '#imports'

interface ProductRow {
  id: string
  created_at: string | null
}

export default defineSitemapEventHandler(async () => {
  const config = useRuntimeConfig()
  // * @nuxtjs/supabase exposes its config under public.supabase; fall back to
  // * the raw SUPABASE_* env (the prefixed NUXT_PUBLIC_* ones aren't set here).
  const sb = (config.public as any).supabase ?? {}
  const base = sb.url || process.env.SUPABASE_URL || config.public.supabaseUrl
  const key = sb.key || process.env.SUPABASE_KEY || config.public.supabaseKey
  if (!base || !key) return []

  try {
    const rows = await $fetch<ProductRow[]>(
      `${base}/rest/v1/products?select=id,created_at&is_visible=eq.true`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
    return rows.map((p) => ({
      loc: `/product/${p.id}`,
      lastmod: p.created_at ?? undefined,
      changefreq: 'weekly' as const,
      priority: 0.8,
    }))
  } catch {
    return []
  }
})
