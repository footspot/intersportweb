// * footspot-send-new-club-request — Flow 2 entry.
// *
// * Admin fills the form when a club director phoned in (off-app) wanting a
// * Footspot integration. We insert an audit row and email the Footspot PDG
// * with the data he needs to manually create the club on his side and call
// * footspot-pairing-complete back.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { verifyAdmin } from '../_shared/auth.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { sendOrderEmail } from '../_shared/emails/send.ts'

interface Payload {
  club_id?: string
  club_name?: string
  contact_name?: string
  contact_email?: string
  contact_phone?: string
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, { status: 405 })

  const guard = await verifyAdmin(req)
  if (guard instanceof Response) return guard

  const sb = serviceClient()

  try {
    const body = (await req.json()) as Payload
    if (!body.club_id || !body.club_name?.trim() || !body.contact_name?.trim() ||
        !body.contact_email || !body.contact_phone?.trim()) {
      return jsonResponse({ error: 'missing_fields' }, { status: 400 })
    }
    if (!isValidEmail(body.contact_email)) {
      return jsonResponse({ error: 'invalid_contact_email' }, { status: 400 })
    }

    // * Verify the club exists and has no active link.
    const { data: club } = await sb
      .from('clubs')
      .select('id, footspot_linked')
      .eq('id', body.club_id)
      .single()
    if (!club) return jsonResponse({ error: 'club_not_found' }, { status: 404 })
    if (club.footspot_linked) {
      return jsonResponse({ error: 'club_already_linked' }, { status: 409 })
    }

    // * 7-day cooldown to avoid spamming the Footspot PDG.
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recent } = await sb
      .from('footspot_integration_requests')
      .select('id')
      .eq('club_id', body.club_id)
      .eq('status', 'sent')
      .gte('sent_at', cutoff)
      .maybeSingle()
    if (recent) {
      return jsonResponse({ error: 'recent_request_pending' }, { status: 409 })
    }

    const { data: row, error } = await sb
      .from('footspot_integration_requests')
      .insert({
        club_id:       body.club_id,
        club_name:     body.club_name.trim(),
        contact_name:  body.contact_name.trim(),
        contact_email: body.contact_email.trim(),
        contact_phone: body.contact_phone.trim(),
        sent_by:       guard.id,
      })
      .select()
      .single()
    if (error) throw error

    // * Email the PDG with a copyable plain-text block. The send result is
    // * returned so the admin form can warn instead of falsely confirming.
    let emailSent = false
    let emailError: string | null = null
    const ownerEmail = Deno.env.get('FOOTSPOT_OWNER_EMAIL')
    if (!ownerEmail) {
      emailError = 'owner_email_not_configured'
      console.error('[footspot-send-new-club-request] FOOTSPOT_OWNER_EMAIL not set — PDG not notified', { request_id: row.id })
    } else {
      // * Partner-level identity of this Intersport instance — the PDG copies
      // * these into the fs_sa "Add partner" screen. base_url is derived from
      // * the project URL; shop_url_prefix + partner id come from env, set once
      // * per deployment. shop_url is the prefix + the club id concatenated
      // * as-is — the prefix carries its own separator (club pages are served
      // * at ".../?club=<uuid>", so INTERSPORT_SHOP_URL_PREFIX ends with "?club=").
      const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')
      const shopUrlPrefix = Deno.env.get('INTERSPORT_SHOP_URL_PREFIX')?.trim()
      const partnerBaseUrl = supabaseUrl
        ? `${supabaseUrl}/functions/v1`
        : '(SUPABASE_URL absent)'
      const shopUrl = shopUrlPrefix
        ? `${shopUrlPrefix}${row.club_id}`
        : '(INTERSPORT_SHOP_URL_PREFIX absent)'
      try {
        await sendOrderEmail({
          to: { email: ownerEmail },
          template: 'footspot-integration-request',
          data: {
            club_name:          row.club_name,
            intersport_club_id: row.club_id,
            contact_name:       row.contact_name,
            contact_email:      row.contact_email,
            contact_phone:      row.contact_phone,
            request_id:         row.id,
            sent_at:            row.sent_at,
            partner_id:         Deno.env.get('INTERSPORT_PARTNER_ID')?.trim() ?? '(INTERSPORT_PARTNER_ID absent)',
            partner_base_url:   partnerBaseUrl,
            shop_url_prefix:    shopUrlPrefix ?? '(INTERSPORT_SHOP_URL_PREFIX absent)',
            shop_url:           shopUrl,
          },
        })
        emailSent = true
      } catch (e) {
        emailError = 'send_failed'
        const detail = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
        console.error('[footspot-send-new-club-request] email FAILED', { request_id: row.id, error: detail })
      }
    }

    // * Notifying the PDG is the whole point of Flow 2 — if the email did not
    // * go out, flip the audit row to 'failed' so it shows red in the history
    // * and is excluded from the 7-day cooldown (the admin can retry at once).
    if (!emailSent) {
      await sb
        .from('footspot_integration_requests')
        .update({ status: 'failed' })
        .eq('id', row.id)
    }

    return jsonResponse(
      { request_id: row.id, email_sent: emailSent, email_error: emailError },
      { status: 201 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[footspot-send-new-club-request]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
