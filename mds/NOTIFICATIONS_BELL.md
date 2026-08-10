# Notifications Bell — Implementation Spec

Status: **spec only, implement after bundle rework lands**.
The `notifications` table is created as part of the bundle migration so events
can be written now; the UI below will consume existing rows with no backend change.

## 1. Data model

Table `notifications` (created in `bundle_rework` migration):

| column       | type                              | notes                                        |
|--------------|-----------------------------------|----------------------------------------------|
| `id`         | uuid pk default `gen_random_uuid` |                                              |
| `user_id`    | uuid fk → `profiles.id`           | one row per recipient admin/employee         |
| `kind`       | text                              | discriminator — see §5                       |
| `payload`    | jsonb                             | shape depends on `kind` (§5)                 |
| `created_at` | timestamptz default `now()`       |                                              |
| `read_at`    | timestamptz null                  | null = unread                                |

Index: `(user_id, read_at, created_at desc)` — drives the bell dropdown query.

RLS: SELECT + UPDATE (`read_at` only) where `user_id = auth.uid()`. Service role writes.

## 2. Backend write path

Notifications are inserted by the same edge functions / RPCs that trigger the
event — **one row per admin & employee user**. Helper RPC:

```sql
create function public.notify_backoffice(p_kind text, p_payload jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (user_id, kind, payload)
  select id, p_kind, p_payload
    from profiles
   where role in ('admin', 'employee') and active = true;
$$;
```

Edge functions call it via `sb.rpc('notify_backoffice', { p_kind, p_payload })`.

## 3. Frontend

### 3.1 `useNotifications()` composable (`app/composables/useNotifications.ts`)

- `items`, `unreadCount`, `loading`, `error`
- Methods: `fetch(limit=20)`, `markRead(id)`, `markAllRead()`
- Subscribes to Supabase Realtime on `notifications` filtered by `user_id=eq.{me}`
  for live updates. Debounce insert batches.

### 3.2 `NotificationsBell.vue` (`app/components/admin/NotificationsBell.vue`)

- Bell icon + unread count badge (hidden when 0)
- Click opens dropdown (~360×480, scrollable):
  - Header: title + "Mark all read" action
  - List of rows: icon by `kind`, translated message, relative time, unread dot
  - Footer: link to `/admin/notifications`
- Empty state: "No notifications yet."

Integrate in `app/layouts/admin.vue` header, right of the user menu.

### 3.3 `/admin/notifications` page

- Full paginated history (50/page)
- Filter chips: `unread` / `all`, by `kind`
- Per-row click: marks read (does not navigate; notifications are informational)

### 3.4 Toast integration

Use the existing toast mechanism (or add `useToast()` via Nuxt UI if present).
Toasts fire **only for the user who triggered the event** — the current
session's notification is both persisted (DB row) and toasted (inline feedback).
Other admins/employees see the row appear in their bell via Realtime.

## 4. i18n

Translation keys under `admin.notifications.*` in `i18n/locales/{en,fr}.json`:

```
admin.notifications.title           — "Notifications"
admin.notifications.markAllRead     — "Mark all read"
admin.notifications.empty           — "No notifications yet."
admin.notifications.viewAll         — "View all"
admin.notifications.kind.<kind>.*   — per-kind title + body templates
admin.notifications.filter.unread   — "Unread"
admin.notifications.filter.all      — "All"
```

## 5. Notification kinds

Extensible enum. Each kind has a canonical payload shape. When adding a new
kind: (a) append here, (b) add i18n keys, (c) emit from the relevant backend
path.

### `product_locked_into_bundle`
Fired when a product becomes a component of a bundle (first time across bundles).
```jsonc
{
  "product_id": "uuid",
  "product_name": "VESTE...",
  "bundle_id": "uuid",
  "bundle_name": "Pack Equipe",
  "club_id": "uuid"
}
```

### `product_released_from_bundle`
Fired when a product is removed from all bundles.
```jsonc
{
  "product_id": "uuid",
  "product_name": "VESTE..."
}
```

### `bundle_component_oos_at_sale`
Fired from `process_paid_order` when a bundle line is refunded because a
component was OOS.
```jsonc
{
  "order_id": "uuid",
  "order_number": "INT-0042",
  "bundle_id": "uuid",
  "bundle_name": "Pack Equipe",
  "oos_component_ids": ["uuid", ...]
}
```

### Future (not wired yet)
- `order_received` — new paid order landed
- `low_stock` — a variant dropped below a threshold
- `refund_processed` — manual refund completed

## 6. Implementation checklist

- [ ] `useNotifications` composable + Realtime subscription
- [ ] `NotificationsBell.vue` component
- [ ] Header integration in `admin.vue` layout
- [ ] `/admin/notifications` full-history page
- [ ] i18n keys (en + fr) for kinds defined in §5
- [ ] Toast wiring on the triggering action (reuse existing pattern)
- [ ] Smoke test: lock/unlock a bundle component → bell updates for a second admin
