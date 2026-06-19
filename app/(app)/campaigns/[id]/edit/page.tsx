import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CampaignEditor } from '../../CampaignEditor';
import { TEMPLATES } from '@/lib/templates';

export default async function EditCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: campaign }, { data: lists }, { data: tenant }] =
    await Promise.all([
      supabase
        .from('campaigns')
        .select(
          'id, subject, html_body, plain_text_body, list_id, status, from_name, from_email, reply_to',
        )
        .eq('id', id)
        .single(),
      supabase
        .from('lists')
        .select('id, name')
        .order('created_at', { ascending: false }),
      supabase
        .from('tenants')
        .select('from_name, from_email, reply_to_email')
        .single(),
    ]);

  if (!campaign) notFound();
  if (campaign.status !== 'draft') {
    redirect(
      `/campaigns/${id}?error=` +
        encodeURIComponent('Sent campaigns cannot be edited.'),
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit campaign
        </h1>
        <Link
          href={`/campaigns/${id}`}
          className="text-sm text-slate-600 underline"
        >
          Back to campaign
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6">
        <CampaignEditor
          mode="edit"
          campaignId={id}
          initial={{
            subject: campaign.subject ?? '',
            html_body: campaign.html_body ?? '',
            plain_text_body: campaign.plain_text_body ?? '',
            from_name: campaign.from_name ?? '',
            from_email: campaign.from_email ?? '',
            reply_to: campaign.reply_to ?? '',
            list_id: campaign.list_id ?? '',
          }}
          lists={lists ?? []}
          templates={TEMPLATES}
          tenantDefaults={{
            from_name: tenant?.from_name ?? '',
            from_email: tenant?.from_email ?? '',
            reply_to_email: tenant?.reply_to_email ?? '',
          }}
        />
      </div>
    </main>
  );
}
