// All inline CSS — Outlook strips <style> blocks. Width capped at 600px,
// system-safe font fallbacks, and {{name}}/{{email}} tokens where personal.

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  html: string;
}

export const TEMPLATES: EmailTemplate[] = [
  {
    id: 'newsletter',
    name: 'Newsletter',
    description: 'Periodic updates with a featured story and call to action.',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px">
  <div style="background:#ffffff;padding:32px;border-radius:8px">
    <h1 style="margin:0 0 16px;color:#0f172a;font-size:28px;line-height:1.2">Your newsletter</h1>
    <p style="color:#475569;line-height:1.6;margin:0 0 24px">Hello {{name}}, here's what's new this period.</p>
    <h2 style="color:#0f172a;font-size:20px;margin:24px 0 8px">Featured story</h2>
    <p style="color:#475569;line-height:1.6;margin:0 0 16px">Replace this paragraph with your content. Keep it short and lead with the most useful thing.</p>
    <a href="https://example.com" style="display:inline-block;background:#0f172a;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600">Read more</a>
  </div>
</div>`,
  },
  {
    id: 'welcome',
    name: 'Welcome',
    description: 'First-touch onboarding with a clear next step.',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:48px 24px;text-align:center">
  <h1 style="font-size:32px;color:#0f172a;margin:0 0 16px">Welcome, {{name}}.</h1>
  <p style="color:#475569;font-size:16px;line-height:1.6;margin:0 0 24px">We're glad you're here. Here's the one thing to do next so you can get value from this.</p>
  <a href="https://example.com/start" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:600">Get started</a>
  <p style="color:#94a3b8;font-size:13px;margin-top:32px">Hit reply any time — a real person reads everything.</p>
</div>`,
  },
  {
    id: 'announcement',
    name: 'Announcement',
    description: 'Share product news, milestones, or important changes.',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:32px">
  <div style="background:#fef3c7;border-left:4px solid #d97706;padding:12px 16px;margin-bottom:24px;border-radius:4px">
    <strong style="color:#92400e;font-size:14px">Announcement</strong>
  </div>
  <h1 style="color:#0f172a;font-size:28px;margin:0 0 16px;line-height:1.2">We have news, {{name}}.</h1>
  <p style="color:#475569;line-height:1.7;margin:0 0 16px">Tell readers what's new. Be specific about what's changing and why it matters to them.</p>
  <p style="color:#475569;line-height:1.7;margin:0 0 24px">If there's an action they should take, spell it out below.</p>
  <a href="https://example.com" style="color:#2563eb;font-weight:600;text-decoration:none">Learn more &rarr;</a>
</div>`,
  },
  {
    id: 'promotion',
    name: 'Promotion',
    description: 'Discount or limited-time offer with a strong CTA.',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:40px 24px;background:#f1f5f9;text-align:center">
  <p style="color:#475569;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px">Limited time</p>
  <h1 style="font-size:48px;color:#dc2626;margin:0 0 8px;line-height:1">25% off</h1>
  <p style="color:#475569;font-size:16px;margin:8px 0 24px">A treat just for you, {{name}}.</p>
  <a href="https://example.com/shop" style="display:inline-block;background:#dc2626;color:#ffffff;padding:16px 40px;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px">Shop now</a>
  <p style="color:#94a3b8;font-size:12px;margin-top:32px">Offer ends soon.</p>
</div>`,
  },
  {
    id: 'simple',
    name: 'Simple letter',
    description: 'A conversational note styled like a personal email.',
    html: `<div style="font-family:Georgia,'Times New Roman',serif;max-width:600px;margin:0 auto;padding:32px;line-height:1.7;color:#1e293b;font-size:16px">
  <p style="margin:0 0 16px">Hi {{name}},</p>
  <p style="margin:0 0 16px">I wanted to drop you a quick note about something I've been thinking about.</p>
  <p style="margin:0 0 16px">Replace this with your message. Write it like you're writing to one person — because you are.</p>
  <p style="margin:0">Best,<br>Your name</p>
</div>`,
  },
];

export function getTemplate(id: string): EmailTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
