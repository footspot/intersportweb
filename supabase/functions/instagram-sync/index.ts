// * instagram-sync — scheduled poller (Supabase cron, every 30 min).
// *
// * Keeps the home-page Instagram feed fresh using the official Instagram API
// * (Instagram API with Instagram Login, graph.instagram.com). On each run it:
// *   1. Loads the single instagram_config row.
// *   2. Refreshes the long-lived access token if it is within REFRESH_WINDOW
// *      of expiry (or has no recorded expiry yet) — this is what keeps the
// *      60-day token alive indefinitely without the client re-doing anything.
// *   3. Fetches the latest posts and upserts them into instagram_posts, then
// *      prunes any cached rows no longer in the latest set.
// *
// * Authenticated by the X-Internal-Call header (cron + manual runs), exactly
// * like colissimo-tracking-worker. No Supabase JWT — verify_jwt = false.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient, serviceRoleKey } from '../_shared/supabase.ts'

const GRAPH_BASE = 'https://graph.instagram.com'
const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp'
const MEDIA_LIMIT = 5
// * Refresh once the token is inside this window of expiry. Long-lived tokens
// * last ~60 days and must be at least 24h old to refresh, so a 7-day window
// * leaves plenty of headroom even if a few runs fail.
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

interface IgMedia {
  id: string
  caption?: string
  media_type?: string
  media_url?: string
  thumbnail_url?: string
  permalink?: string
  timestamp?: string
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre

  // * Internal cron OR manual admin run — gate on the service-role key.
  const internalKey = req.headers.get('X-Internal-Call')
  const serviceRole = serviceRoleKey()
  if (!internalKey || !serviceRole || internalKey !== serviceRole) {
    return jsonResponse({ error: 'forbidden' }, { status: 403 })
  }

  const sb = serviceClient()

  const { data: config, error: cfgErr } = await sb
    .from('instagram_config')
    .select('id, access_token, token_expires_at, ig_user_id, username')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (cfgErr) {
    console.error('[instagram-sync] config read failed', cfgErr)
    return jsonResponse({ error: cfgErr.message }, { status: 500 })
  }
  if (!config?.access_token) {
    // * Not seeded yet — nothing to do. Not an error: lets us deploy before the
    // * client has handed over a token.
    return jsonResponse({ ok: true, skipped: 'no_token' })
  }

  let token = config.access_token as string
  let tokenExpiresAt = config.token_expires_at as string | null
  let username = config.username as string | null

  // * ── 1. Refresh the long-lived token if it is near expiry ──
  const needsRefresh =
    !tokenExpiresAt ||
    new Date(tokenExpiresAt).getTime() - Date.now() < REFRESH_WINDOW_MS
  if (needsRefresh) {
    try {
      const url = `${GRAPH_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`
      const res = await fetch(url)
      const json = (await res.json().catch(() => ({}))) as {
        access_token?: string
        expires_in?: number
        error?: { message?: string }
      }
      if (!res.ok || !json.access_token) {
        // * Don't abort the run — a refresh failure (e.g. token <24h old) still
        // * lets us read media with the current token below. Record the reason.
        console.warn('[instagram-sync] token refresh failed', json.error ?? res.status)
        await sb
          .from('instagram_config')
          .update({ last_error: `refresh: ${json.error?.message ?? res.status}`, updated_at: new Date().toISOString() })
          .eq('id', config.id)
      } else {
        token = json.access_token
        tokenExpiresAt = new Date(Date.now() + (json.expires_in ?? 0) * 1000).toISOString()
        await sb
          .from('instagram_config')
          .update({
            access_token: token,
            token_expires_at: tokenExpiresAt,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id)
      }
    } catch (e) {
      console.warn('[instagram-sync] token refresh threw', e)
    }
  }

  // * ── 2. Resolve the account username once (for the storefront header) ──
  if (!username) {
    try {
      const meRes = await fetch(`${GRAPH_BASE}/me?fields=username&access_token=${encodeURIComponent(token)}`)
      const me = (await meRes.json().catch(() => ({}))) as { username?: string }
      if (me.username) {
        username = me.username
        await sb.from('instagram_config').update({ username }).eq('id', config.id)
      }
    } catch (_) {
      /* non-fatal */
    }
  }

  // * ── 3. Fetch the latest media ──
  let media: IgMedia[] = []
  try {
    const url = `${GRAPH_BASE}/me/media?fields=${MEDIA_FIELDS}&limit=${MEDIA_LIMIT}&access_token=${encodeURIComponent(token)}`
    const res = await fetch(url)
    const json = (await res.json().catch(() => ({}))) as { data?: IgMedia[]; error?: { message?: string } }
    if (!res.ok || !json.data) {
      const msg = json.error?.message ?? `media fetch ${res.status}`
      console.error('[instagram-sync] media fetch failed', msg)
      await sb
        .from('instagram_config')
        .update({ last_error: `media: ${msg}`, updated_at: new Date().toISOString() })
        .eq('id', config.id)
      return jsonResponse({ error: msg }, { status: 502 })
    }
    media = json.data
  } catch (e) {
    console.error('[instagram-sync] media fetch threw', e)
    return jsonResponse({ error: String(e) }, { status: 502 })
  }

  if (!media.length) {
    await sb
      .from('instagram_config')
      .update({ last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq('id', config.id)
    return jsonResponse({ ok: true, synced: 0 })
  }

  // * ── 4. Upsert posts, then prune anything no longer in the latest set ──
  const rows = media.map((m) => ({
    ig_id: m.id,
    media_type: m.media_type ?? null,
    media_url: m.media_url ?? null,
    thumbnail_url: m.thumbnail_url ?? null,
    permalink: m.permalink ?? null,
    caption: m.caption ?? null,
    posted_at: m.timestamp ?? null,
  }))

  const { error: upErr } = await sb.from('instagram_posts').upsert(rows, { onConflict: 'ig_id' })
  if (upErr) {
    console.error('[instagram-sync] upsert failed', upErr)
    return jsonResponse({ error: upErr.message }, { status: 500 })
  }

  const keepIds = media.map((m) => m.id)
  await sb.from('instagram_posts').delete().not('ig_id', 'in', `(${keepIds.map((i) => `"${i}"`).join(',')})`)

  await sb
    .from('instagram_config')
    .update({ last_synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
    .eq('id', config.id)

  return jsonResponse({ ok: true, synced: rows.length, username })
})
