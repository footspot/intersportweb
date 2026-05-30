# Instagram "latest post" on the home page

The storefront home page shows the **most recent post** from the official Intersport
Instagram account. A Supabase cron worker (`instagram-sync`, every 30 min) refreshes
the access token and pulls the latest posts into the `instagram_posts` table; the home
page reads that cached row directly. The browser never sees the access token.

- **Worker:** `supabase/functions/instagram-sync/index.ts`
- **Tables:** `instagram_config` (token, locked down) + `instagram_posts` (public read)
- **Cron:** `instagram_sync` job in `supabase/migrations/20260529000001_instagram_feed.sql`
- **Front-end:** `app/stores/instagram.ts` + `app/components/home/InstagramLatest.vue`

The feed stays empty (and the home-page section simply doesn't render) until the
`instagram_config` row is seeded with a token. Getting that token is the **only step
the client has to do** — once, by hand. Everything else is automated.

---

## Client checklist — get the access token + account ID

> ⚠️ This must be done by someone who can **log into the Intersport Instagram account**
> and has (or can create) a **Facebook account**. As the developer I cannot do this for
> you — Meta ties the token to whoever owns the account.

### Step 1 — Make the Instagram account a Business or Creator account
In the Instagram app: **Settings → Account type and tools → Switch to professional
account** → choose **Business** (or Creator). Personal accounts cannot use the API.

### Step 2 — Create a Meta app
1. Go to <https://developers.facebook.com/> and log in with a Facebook account.
2. **My Apps → Create App.**
3. For the use case, pick **"Other" → Business** (whichever the wizard offers that lets
   you add the Instagram product).
4. Give it a name (e.g. *Intersport Site Feed*) and create it.

### Step 3 — Add the "Instagram" product (Instagram API with Instagram Login)
1. In the app dashboard, find **Instagram** in the products list → **Set up**.
2. Use **"Instagram API with Instagram Login"** (NOT the old *Basic Display* — Meta shut
   that down in December 2024).
3. Follow the prompts to connect the Intersport Instagram account.

### Step 4 — Generate a long-lived access token
In the Instagram product settings there is a **token generator**:
1. Click **Generate token** next to the connected Instagram account.
2. Approve the permission request (it asks for read access to the account's media —
   the permission is called `instagram_business_basic`).
3. Copy the **access token** that appears. This is a **long-lived token, valid 60 days**.

### Step 5 — Get the Instagram account ID (optional but handy)
On the same screen Meta usually shows the **Instagram-scoped user ID** / account ID.
Copy it if it's shown. (The worker can also discover it automatically, so this is
nice-to-have, not required.)

### Step 6 — Send me two things
Send the developer, **privately** (not by email/Slack in plain text if avoidable —
treat it like a password):

| What | Example |
|------|---------|
| **Access token** | `IGAAQ...` (a long string) |
| **Instagram account ID** | `17841400000000000` (if shown) |

That's the end of the client's job. I seed it into the database once, and from then on
the worker auto-refreshes the token before it expires — the client never repeats this
unless they change the IG password or remove the app.

---

## ⚠️ Important note for the client about "Live mode" / App Review

While the Meta app is in **Development mode**, the token only works for Instagram
accounts that are added to the app as a role/tester. To run on the **public production
website**, the app usually has to be switched to **Live mode**, which means submitting
the `instagram_business_basic` permission for **Meta App Review** (they ask for a short
screencast and a description of how the data is used — "displaying our latest post on
our own website").

Review can take **a few days**, so start it early. Until then the feed will work in
testing but may not show for the public.

---

## Developer steps (after the client sends the token)

1. Deploy DB + function:
   ```bash
   supabase db push
   supabase functions deploy instagram-sync
   ```
2. Seed the token (one-off, **do not commit**) — via `supabase db` SQL or the dashboard
   SQL editor:
   ```sql
   update instagram_config
   set access_token = '<TOKEN_FROM_CLIENT>',
       ig_user_id   = '<ACCOUNT_ID_OR_NULL>',
       token_expires_at = now() + interval '55 days', -- conservative; worker corrects it
       updated_at = now();
   ```
3. Trigger a first sync manually to verify:
   ```bash
   curl -X POST "$SUPABASE_URL/functions/v1/instagram-sync" \
     -H "X-Internal-Call: <SERVICE_ROLE_KEY>" -H "Content-Type: application/json" -d '{}'
   ```
   Expect `{"ok":true,"synced":N}` and rows in `instagram_posts`.

### Token lifecycle
The worker refreshes the long-lived token whenever it is within 7 days of expiry, so it
never lapses as long as the cron keeps running. If the client changes the IG password or
removes the Meta app, the token dies — the home page keeps showing the last cached post
until you reseed a fresh token (repeat the client checklist).
