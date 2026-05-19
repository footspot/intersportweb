// * Backoffice notifications bell — state + realtime.
// *
// *   Realtime publication includes `notifications` (server-side, see migration
// *   notifications_realtime). The channel is filtered to the current user so
// *   each admin/employee only sees their own rows. New rows prepend to the
// *   in-memory list; updates (read_at flip) refresh the matching row.
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface NotificationRow {
  id: string
  user_id: string
  kind: string
  payload: Record<string, unknown>
  created_at: string
  read_at: string | null
}

const PAGE_SIZE = 50

export function useNotifications() {
  const items = useState<NotificationRow[]>('admin:notifications', () => [])
  const loading = useState<boolean>('admin:notifications:loading', () => false)
  const error = useState<string | null>('admin:notifications:error', () => null)
  const subscribed = useState<boolean>('admin:notifications:subscribed', () => false)

  const unreadCount = computed(() => items.value.filter((n) => !n.read_at).length)

  const client = useSupabaseClient()
  const user = useSupabaseUser()

  async function fetch(limit = PAGE_SIZE) {
    if (!user.value) return
    loading.value = true
    error.value = null
    try {
      const { data, error: err } = await client
        .from('notifications')
        .select('*')
        .eq('user_id', user.value.id)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (err) throw err
      items.value = (data ?? []) as NotificationRow[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load notifications'
    } finally {
      loading.value = false
    }
  }

  async function markRead(id: string) {
    if (!user.value) return
    const target = items.value.find((n) => n.id === id)
    if (!target || target.read_at) return
    target.read_at = new Date().toISOString()
    const { error: err } = await client
      .from('notifications')
      .update({ read_at: target.read_at })
      .eq('id', id)
      .eq('user_id', user.value.id)
    if (err) {
      target.read_at = null
      console.error('[useNotifications] markRead failed', err)
    }
  }

  async function markAllRead() {
    if (!user.value) return
    const now = new Date().toISOString()
    const unread = items.value.filter((n) => !n.read_at)
    if (unread.length === 0) return
    for (const n of unread) n.read_at = now
    const ids = unread.map((n) => n.id)
    const { error: err } = await client
      .from('notifications')
      .update({ read_at: now })
      .in('id', ids)
      .eq('user_id', user.value.id)
    if (err) {
      for (const n of unread) n.read_at = null
      console.error('[useNotifications] markAllRead failed', err)
    }
  }

  let channel: RealtimeChannel | null = null
  function subscribe() {
    if (subscribed.value || !user.value) return
    channel = client
      .channel(`admin-notifications:${user.value.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.value.id}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow
          if (!items.value.some((n) => n.id === row.id)) {
            items.value.unshift(row)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.value.id}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow
          const idx = items.value.findIndex((n) => n.id === row.id)
          if (idx !== -1) items.value[idx] = row
        },
      )
      .subscribe()
    subscribed.value = true
  }

  function unsubscribe() {
    if (channel) {
      client.removeChannel(channel)
      channel = null
    }
    subscribed.value = false
  }

  return { items, loading, error, unreadCount, fetch, markRead, markAllRead, subscribe, unsubscribe }
}
