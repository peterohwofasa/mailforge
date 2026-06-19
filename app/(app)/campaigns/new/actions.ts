'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function createCampaign(formData: FormData) {
  const subject = String(formData.get('subject') ?? '').trim();
  const html_body = String(formData.get('html_body') ?? '');
  const plain_text_body = String(formData.get('plain_text_body') ?? '').trim() || null;
  const list_id = String(formData.get('list_id') ?? '');
  const from_name = String(formData.get('from_name') ?? '').trim() || null;
  const from_email = String(formData.get('from_email') ?? '').trim().toLowerCase() || null;
  const reply_to = String(formData.get('reply_to') ?? '').trim().toLowerCase() || null;

  if (!subject || !html_body || !list_id) {
    redirect(
      '/campaigns/new?error=' +
        encodeURIComponent('Subject, HTML body, and list are required.'),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      tenant_id: user.id,
      subject,
      html_body,
      plain_text_body,
      list_id,
      from_name,
      from_email,
      reply_to,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error || !data) {
    redirect(
      '/campaigns/new?error=' +
        encodeURIComponent(error?.message ?? 'Failed to create campaign.'),
    );
  }

  revalidatePath('/campaigns');
  redirect(`/campaigns/${data.id}`);
}
