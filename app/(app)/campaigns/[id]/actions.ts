'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resend } from '@/lib/resend';
import { renderEmail } from '@/lib/email/render';
import { signUnsubscribeToken } from '@/lib/email/tokens';
import {
  filterRecipientsForSend,
  evaluateSuspendCheck,
} from '@/lib/send';

const BATCH_SIZE = 100;

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  status: string;
}

interface TenantRow {
  id: string;
  from_name: string | null;
  from_email: string | null;
  reply_to_email: string | null;
  physical_address: string | null;
  daily_send_limit: number | null;
  suspended: boolean | null;
}

interface CampaignRow {
  id: string;
  subject: string;
  html_body: string | null;
  plain_text_body: string | null;
  list_id: string | null;
  status: string;
  reply_to: string | null;
  from_name: string | null;
  from_email: string | null;
}

export async function sendCampaign(formData: FormData) {
  const campaignId = String(formData.get('campaign_id') ?? '');
  if (!campaignId) redirect('/campaigns');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // --- Load campaign + tenant ---------------------------------------------

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select(
      'id, subject, html_body, plain_text_body, list_id, status, reply_to, from_name, from_email',
    )
    .eq('id', campaignId)
    .single<CampaignRow>();

  if (campaignError || !campaign) {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent('Campaign not found.'),
    );
  }
  if (campaign.status === 'sent') {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent('Campaign is already fully sent.'),
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
    .select(
      'id, from_name, from_email, reply_to_email, physical_address, daily_send_limit, suspended',
    )
    .single<TenantRow>();
  if (tenantError || !tenant) {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent('Tenant profile missing.'),
    );
  }
  if (tenant.suspended) {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent(
          'Account suspended due to high bounce or complaint rate.',
        ),
    );
  }

  // --- Load active recipients + existing events ---------------------------

  const { data: membership } = await supabase
    .from('list_contacts')
    .select('contact:contacts(id, email, name, status)')
    .eq('list_id', campaign.list_id);

  const recipients: Recipient[] = (membership ?? [])
    .map((m) => m.contact as unknown as Recipient | null)
    .filter((c): c is Recipient => !!c && c.status === 'active');

  if (recipients.length === 0) {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent('No active recipients in this list.'),
    );
  }

  const { data: existingEvents } = await supabase
    .from('events')
    .select('contact_id, type')
    .eq('campaign_id', campaignId);

  const remaining = filterRecipientsForSend(recipients, existingEvents ?? []);

  if (remaining.length === 0) {
    // Everything already processed in a prior run. Finalize.
    await supabase
      .from('campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', campaignId);
    revalidatePath(`/campaigns/${campaignId}`);
    revalidatePath(`/campaigns/${campaignId}/report`);
    redirect(`/campaigns/${campaignId}/report`);
  }

  // --- Daily send limit ---------------------------------------------------

  const dailyLimit = tenant.daily_send_limit ?? 100;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count: sentToday } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .eq('type', 'sent')
    .gte('created_at', todayStart.toISOString());

  const dailyRemaining = dailyLimit - (sentToday ?? 0);
  if (dailyRemaining <= 0) {
    redirect(
      `/campaigns/${campaignId}?error=` +
        encodeURIComponent(
          `Daily send limit of ${dailyLimit} reached. Resume tomorrow — idempotency will skip already-sent recipients.`,
        ),
    );
  }

  const toSend = remaining.slice(0, dailyRemaining);
  const partial = toSend.length < remaining.length;

  // --- Flip to 'sending' so duplicate submits bounce on the status gate ---

  await supabase
    .from('campaigns')
    .update({ status: 'sending' })
    .eq('id', campaignId);

  // --- Build addressing ----------------------------------------------------

  const fromAddress = campaign.from_email ?? tenant.from_email ?? '';
  const fromName = campaign.from_name ?? tenant.from_name ?? '';
  const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
  const replyTo =
    campaign.reply_to ?? tenant.reply_to_email ?? fromAddress;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');

  // --- Send in batches of 100 ---------------------------------------------

  for (let i = 0; i < toSend.length; i += BATCH_SIZE) {
    const slice = toSend.slice(i, i + BATCH_SIZE);

    const messages = slice.map((recipient) => {
      const token = signUnsubscribeToken({
        c: recipient.id,
        m: campaign.id,
      });
      const humanUnsubUrl = `${appUrl}/unsubscribe/${token}`;
      const postUnsubUrl = `${appUrl}/api/unsubscribe?token=${token}`;

      const rendered = renderEmail({
        htmlBody: campaign.html_body ?? '',
        contact: recipient,
        tenant,
        unsubUrl: humanUnsubUrl,
      });

      const text = campaign.plain_text_body?.trim()
        ? campaign.plain_text_body
        : rendered.text;

      return {
        from,
        to: recipient.email,
        subject: campaign.subject,
        html: rendered.html,
        text,
        replyTo,
        headers: {
          // RFC 8058 one-click: mail clients POST to the HTTPS URL with body
          // `List-Unsubscribe=One-Click`. The mailto: fallback is for manual
          // unsub via reply.
          'List-Unsubscribe': `<mailto:${replyTo}?subject=unsubscribe>, <${postUnsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      };
    });

    const { data: batchData, error: batchError } = await resend.batch.send(
      messages,
    );

    if (batchError || !batchData) {
      // Transient batch-level failure (network, Resend 5xx). Skip recording —
      // the next invocation's idempotency filter will pick these recipients
      // up again. No 'bounced' event because the recipient didn't actually
      // bounce; the send never reached delivery.
      console.error('[mailforge] batch send failed', batchError);
      continue;
    }

    const ids = batchData.data ?? [];
    const events = slice.map((recipient, idx) => ({
      tenant_id: tenant.id,
      campaign_id: campaign.id,
      contact_id: recipient.id,
      resend_email_id: ids[idx]?.id ?? null,
      type: 'sent' as const,
    }));

    const { error: insertError } = await supabase
      .from('events')
      .insert(events);
    if (insertError) {
      console.error('[mailforge] failed to record sent events', insertError);
    }
  }

  // --- Finalize status -----------------------------------------------------

  const { count: processedCount } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .neq('type', 'queued');

  if ((processedCount ?? 0) >= recipients.length) {
    await supabase
      .from('campaigns')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', campaign.id);
  }
  // else: leave status as 'sending' — partial day-limit slice or batch
  // failure. User can retry; idempotency handles the rest.

  // --- Abuse / suspend evaluation -----------------------------------------

  await evaluateSuspendCheck(tenant.id);

  revalidatePath(`/campaigns/${campaign.id}`);
  revalidatePath(`/campaigns/${campaign.id}/report`);

  if (partial) {
    redirect(
      `/campaigns/${campaign.id}?notice=` +
        encodeURIComponent(
          `Sent ${toSend.length}. Remaining ${remaining.length - toSend.length} pending — daily limit hit. Resume tomorrow.`,
        ),
    );
  }
  redirect(`/campaigns/${campaign.id}/report`);
}

export async function updateCampaign(formData: FormData) {
  const id = String(formData.get('campaign_id') ?? '');
  if (!id) redirect('/campaigns');

  const subject = String(formData.get('subject') ?? '').trim();
  const html_body = String(formData.get('html_body') ?? '');
  const plain_text_body =
    String(formData.get('plain_text_body') ?? '').trim() || null;
  const list_id = String(formData.get('list_id') ?? '');
  const from_name = String(formData.get('from_name') ?? '').trim() || null;
  const from_email =
    String(formData.get('from_email') ?? '').trim().toLowerCase() || null;
  const reply_to =
    String(formData.get('reply_to') ?? '').trim().toLowerCase() || null;

  if (!subject || !html_body || !list_id) {
    redirect(
      `/campaigns/${id}/edit?error=` +
        encodeURIComponent('Subject, HTML body, and list are required.'),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: existing } = await supabase
    .from('campaigns')
    .select('status')
    .eq('id', id)
    .single();

  if (!existing) {
    redirect(`/campaigns?error=` + encodeURIComponent('Campaign not found.'));
  }
  if (existing.status !== 'draft') {
    redirect(
      `/campaigns/${id}?error=` +
        encodeURIComponent('Sent campaigns cannot be edited.'),
    );
  }

  const { error } = await supabase
    .from('campaigns')
    .update({
      subject,
      html_body,
      plain_text_body,
      list_id,
      from_name,
      from_email,
      reply_to,
    })
    .eq('id', id);

  if (error) {
    redirect(
      `/campaigns/${id}/edit?error=` + encodeURIComponent(error.message),
    );
  }

  revalidatePath('/campaigns');
  revalidatePath(`/campaigns/${id}`);
  redirect(`/campaigns/${id}?notice=` + encodeURIComponent('Saved.'));
}
