'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resend } from '@/lib/resend';
import { renderEmail } from '@/lib/email/render';

export async function sendCampaign(formData: FormData) {
  const campaignId = String(formData.get('campaign_id') ?? '');
  if (!campaignId) {
    redirect('/campaigns');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, subject, html_body, list_id, status, reply_to, from_name, from_email')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    redirect(
      `/campaigns/${campaignId}?error=` + encodeURIComponent('Campaign not found.'),
    );
  }
  if (campaign.status !== 'draft') {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent('Already sent. Idempotent retries land in Phase 7.'),
    );
  }
  if (!campaign.list_id) {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent('Campaign has no list.'),
    );
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('*')
    .single();
  if (tenantError || !tenant) {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent('Tenant profile missing.'),
    );
  }
  if (tenant.suspended) {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent('Account suspended.'),
    );
  }

  // Active members of the campaign's list.
  const { data: membership } = await supabase
    .from('list_contacts')
    .select('contact:contacts(id, email, name, status)')
    .eq('list_id', campaign.list_id);

  const recipients = (membership ?? [])
    .map((m) => m.contact as unknown as {
      id: string;
      email: string;
      name: string | null;
      status: string;
    } | null)
    .filter(
      (c): c is { id: string; email: string; name: string | null; status: string } =>
        !!c && c.status === 'active',
    );

  if (recipients.length === 0) {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent('No active recipients in this list.'),
    );
  }

  // Flip to 'sending' so concurrent submits bounce on the status check above.
  await supabase
    .from('campaigns')
    .update({ status: 'sending' })
    .eq('id', campaignId);

  const fromAddress = campaign.from_email ?? tenant.from_email ?? '';
  const fromName = campaign.from_name ?? tenant.from_name ?? '';
  const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
  const replyTo =
    campaign.reply_to ?? tenant.reply_to_email ?? fromAddress;

  // Thin slice: one-at-a-time send. Phase 7 batches via resend.batch.send.
  for (const recipient of recipients) {
    const rendered = renderEmail({
      htmlBody: campaign.html_body ?? '',
      contact: recipient,
      tenant,
    });

    const { data: sent, error: sendError } = await resend.emails.send({
      from,
      to: recipient.email,
      subject: campaign.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo,
    });

    if (sendError || !sent) {
      console.error('[mailforge] resend send error', sendError);
      // Drop into 'bounced' event so the report shows the failure. Phase 7
      // distinguishes transport errors from bounces properly.
      await supabase.from('events').insert({
        tenant_id: tenant.id,
        campaign_id: campaignId,
        contact_id: recipient.id,
        type: 'bounced',
        metadata: { error: sendError?.message ?? 'unknown' },
      });
      continue;
    }

    await supabase.from('events').insert({
      tenant_id: tenant.id,
      campaign_id: campaignId,
      contact_id: recipient.id,
      resend_email_id: sent.id,
      type: 'sent',
    });
  }

  await supabase
    .from('campaigns')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', campaignId);

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/report`);
  redirect(`/campaigns/${campaignId}/report`);
}
