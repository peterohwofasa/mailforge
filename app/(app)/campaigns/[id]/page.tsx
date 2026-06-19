import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { sendCampaign } from './actions';

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from('campaigns')
    .select(
      'id, subject, html_body, status, created_at, sent_at, list_id, list:lists(name)',
    )
    .eq('id', id)
    .single();

  if (!campaign) notFound();

  const list = campaign.list as unknown as { name: string } | null;

  // Recipient count for the slice — Phase 4+ will use a proper view/function.
  let recipientCount = 0;
  if (campaign.list_id) {
    const { count } = await supabase
      .from('list_contacts')
      .select('contact_id', { count: 'exact', head: true })
      .eq('list_id', campaign.list_id);
    recipientCount = count ?? 0;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {campaign.subject}
        </h1>
        <Link href="/campaigns" className="text-sm text-slate-600 underline">
          Back
        </Link>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-md border border-slate-200 bg-white p-4 text-sm">
        <div>
          <dt className="text-xs uppercase text-slate-500">Status</dt>
          <dd className="mt-1 font-medium">{campaign.status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">List</dt>
          <dd className="mt-1">{list?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Recipients</dt>
          <dd className="mt-1">{recipientCount}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Created</dt>
          <dd className="mt-1">
            {new Date(campaign.created_at).toLocaleString()}
          </dd>
        </div>
        {campaign.sent_at && (
          <div className="col-span-2">
            <dt className="text-xs uppercase text-slate-500">Sent</dt>
            <dd className="mt-1">{new Date(campaign.sent_at).toLocaleString()}</dd>
          </div>
        )}
      </dl>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-slate-700">HTML body</h2>
        <pre className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs">
          {campaign.html_body ?? ''}
        </pre>
      </section>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        {campaign.status === 'draft' && (
          <form action={sendCampaign}>
            <input type="hidden" name="campaign_id" value={campaign.id} />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Send to {recipientCount} recipient
              {recipientCount === 1 ? '' : 's'}
            </button>
          </form>
        )}
        <Link
          href={`/campaigns/${campaign.id}/report`}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          View report
        </Link>
      </div>
    </main>
  );
}
