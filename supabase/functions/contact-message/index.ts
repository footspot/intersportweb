// * contact-message — public storefront contact form.
// *
// * POST { name, email, subject?, message? } → emails the shop inbox with
// * Reply-To set to the submitter so staff can answer directly. Guest, no
// * Supabase JWT.
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { serviceClient } from '../_shared/supabase.ts'
import { sendOrderEmail } from '../_shared/emails/send.ts'

// * Fixed business inbox that receives contact-form submissions. Decoupled from
// * the public `contact_info.email` (what visitors see) so the form routes to a
// * monitored mailbox. Override with the CONTACT_RECIPIENT_EMAIL secret.
const CONTACT_RECIPIENT = 'shop@intersportclubidf.com'

interface Payload {
  name?: unknown
  email?: unknown
  subject?: unknown
  message?: unknown
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

// * Escape user input before it lands in the HTML email body.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, { status: 405 })

  try {
    const body = (await req.json().catch(() => ({}))) as Payload
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim()
    const subject = String(body.subject ?? '').trim()
    const message = String(body.message ?? '').trim()

    if (!name || !email) return jsonResponse({ error: 'missing_fields' }, { status: 400 })
    if (!isValidEmail(email)) return jsonResponse({ error: 'invalid_email' }, { status: 400 })
    if (name.length > 120 || subject.length > 200 || message.length > 5000) {
      return jsonResponse({ error: 'too_long' }, { status: 400 })
    }

    const emailKey = email.toLowerCase()
    // * Client IP (Supabase passes it through x-forwarded-for; first hop is the user).
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null

    const sb = serviceClient()

    // * Flood protection — cap submissions per email and per IP within a window.
    const HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const MAX_PER_EMAIL_PER_HOUR = 3
    const MAX_PER_IP_PER_HOUR = 8

    const { count: emailCount } = await sb
      .from('contact_messages')
      .select('id', { count: 'exact', head: true })
      .eq('email', emailKey)
      .gte('created_at', HOUR_AGO)
    if ((emailCount ?? 0) >= MAX_PER_EMAIL_PER_HOUR) {
      return jsonResponse({ error: 'rate_limited' }, { status: 429 })
    }

    if (ip) {
      const { count: ipCount } = await sb
        .from('contact_messages')
        .select('id', { count: 'exact', head: true })
        .eq('ip', ip)
        .gte('created_at', HOUR_AGO)
      if ((ipCount ?? 0) >= MAX_PER_IP_PER_HOUR) {
        return jsonResponse({ error: 'rate_limited' }, { status: 429 })
      }
    }

    const recipient =
      Deno.env.get('CONTACT_RECIPIENT_EMAIL') || CONTACT_RECIPIENT || Deno.env.get('BREVO_SENDER_EMAIL')
    if (!recipient) return jsonResponse({ error: 'no_recipient' }, { status: 500 })

    // * Record the attempt before sending so it counts toward the rate limit even
    // * if the mail provider is slow/fails on a retry storm.
    await sb.from('contact_messages').insert({
      name,
      email: emailKey,
      subject: subject || null,
      message: message || null,
      ip,
    })

    await sendOrderEmail({
      to: { email: recipient, name: 'Intersport Club IDF' },
      replyTo: { email, name },
      template: 'contact-message',
      data: {
        name: esc(name),
        email: esc(email),
        subject: esc(subject || 'Nouveau message'),
        message: esc(message || '—'),
      },
    })

    return jsonResponse({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[contact-message]', msg)
    return jsonResponse({ error: msg }, { status: 500 })
  }
})
