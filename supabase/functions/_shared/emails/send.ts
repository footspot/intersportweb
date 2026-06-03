// * Brevo transactional email wrapper used by every Edge Function that
// * needs to email a customer or admin. Templates live next to this file
// * under ./templates/.
// *
// * Required Supabase secrets (already configured in production):
// *   BREVO_API_KEY
// *   BREVO_SENDER_EMAIL
// *
// * Usage:
// *   await sendOrderEmail({
// *     to:       { email: 'jean@example.com', name: 'Jean Dupont' },
// *     template: 'payment-confirmed',
// *     data:     { customer_name: 'Jean', order_number: 'CMD-...', magic_link: '...' },
// *   })

import { renderTemplate, TemplateData } from './render.ts'

const SENDER_NAME = 'Intersport Club IDF'

export interface SendOpts {
  to: { email: string; name?: string }
  template: string
  data: TemplateData
  // * Optional CC for admin-style notifications (low-stock, etc.)
  cc?: { email: string; name?: string }[]
  // * If set, will replace the default Brevo sender. Defaults to BREVO_SENDER_EMAIL.
  fromOverride?: { email: string; name?: string }
  // * Optional Reply-To (e.g. a contact-form submitter so staff can reply directly).
  replyTo?: { email: string; name?: string }
}

export async function sendOrderEmail(opts: SendOpts): Promise<{ ok: true; messageId: string | null }> {
  const apiKey = Deno.env.get('BREVO_API_KEY')
  const senderEmail = opts.fromOverride?.email ?? Deno.env.get('BREVO_SENDER_EMAIL')
  if (!apiKey || !senderEmail) {
    throw new Error('Brevo not configured: BREVO_API_KEY / BREVO_SENDER_EMAIL missing')
  }

  const { subject, html } = await renderTemplate(opts.template, opts.data)

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: opts.fromOverride?.name ?? SENDER_NAME },
      to: [{ email: opts.to.email, name: opts.to.name }],
      cc: opts.cc,
      replyTo: opts.replyTo,
      subject,
      htmlContent: html,
    }),
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error('[sendOrderEmail] Brevo error', { template: opts.template, status: res.status, json })
    throw new Error(`Brevo send failed: ${json?.message ?? res.statusText}`)
  }
  return { ok: true, messageId: json?.messageId ?? null }
}
