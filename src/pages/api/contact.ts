export const prerender = false;

import type { APIRoute } from 'astro';
import { z } from 'zod';
import { Resend } from 'resend';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(200).optional().or(z.literal('')),
  message: z.string().trim().min(10).max(4000),
  website: z.string().max(0).optional().or(z.literal('')),
});

const TO = 'hello@holistiqnexus.com';
const FROM = 'Holistiq Nexus <noreply@holistiqnexus.com>';

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) return await request.json();
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const fd = await request.formData();
    return Object.fromEntries(fd.entries());
  }
  return {};
}

export const POST: APIRoute = async ({ request }) => {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Mailer not configured.' }), { status: 500 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = await readBody(request);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Please check the form fields and try again.' }), { status: 400 });
  }
  const { name, email, company, message, website } = parsed.data;
  if (website) return new Response(JSON.stringify({ ok: true }), { status: 200 });

  const resend = new Resend(apiKey);
  const subject = `New enquiry — ${name}${company ? ` (${company})` : ''}`;
  const html = `
    <div style="font-family:system-ui,sans-serif;color:#12151A;">
      <h2 style="margin:0 0 12px;">New enquiry from holistiqnexus.com</h2>
      <p><strong>Name:</strong> ${esc(name)}</p>
      <p><strong>Email:</strong> ${esc(email)}</p>
      ${company ? `<p><strong>Company:</strong> ${esc(company)}</p>` : ''}
      <p><strong>Message:</strong></p>
      <pre style="white-space:pre-wrap;font-family:inherit;background:#f4f4f6;padding:12px;border-radius:4px;">${esc(message)}</pre>
    </div>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: TO,
    replyTo: email,
    subject,
    html,
  });

  if (error) {
    console.error('Resend error:', error);
    return new Response(JSON.stringify({ error: 'Could not send. Please email hello@holistiqnexus.com directly.' }), { status: 502 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
