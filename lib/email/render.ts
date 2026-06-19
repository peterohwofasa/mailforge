// Email renderer. {{name}}/{{email}} substitution + auto-appended footer
// with the recipient-specific signed unsubscribe link (built upstream) and the
// tenant's physical address (required by law in every send).

interface ContactLike {
  email: string;
  name: string | null;
}

interface TenantLike {
  physical_address: string | null;
}

interface RenderArgs {
  htmlBody: string;
  contact: ContactLike;
  tenant: TenantLike;
  /** Signed, recipient-specific unsubscribe URL — built by the caller. */
  unsubUrl: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

export function renderEmail({
  htmlBody,
  contact,
  tenant,
  unsubUrl,
}: RenderArgs): RenderedEmail {
  const personalised = htmlBody
    .replaceAll('{{name}}', escapeHtml(contact.name ?? ''))
    .replaceAll('{{email}}', escapeHtml(contact.email));

  const address = escapeHtml(tenant.physical_address ?? '');

  const html = `${personalised}
<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px" />
<p style="color:#6b7280;font-size:12px;line-height:1.5;font-family:Arial,sans-serif">
  <a href="${unsubUrl}" style="color:#6b7280">Unsubscribe</a> &middot; ${address}
</p>`;

  return { html, text: htmlToText(html) };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((line) => line.trim())
    .filter((line, idx, arr) => !(line === '' && arr[idx - 1] === ''))
    .join('\n')
    .trim();
}
