import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { sendCampaign } from './actions';
import { buildPreviewDoc } from '@/lib/preview';

type Status = 'draft' | 'sending' | 'sent';

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from('campaigns')
    .select(
      'id, subject, html_body, plain_text_body, status, created_at, sent_at, list_id, list:lists(name)',
    )
    .eq('id', id)
    .single();

  if (!campaign) notFound();

  const list = campaign.list as unknown as { name: string } | null;
  const status = campaign.status as Status;

  let recipientCount = 0;
  if (campaign.list_id) {
    const { count } = await supabase
      .from('list_contacts')
      .select('contact_id', { count: 'exact', head: true })
      .eq('list_id', campaign.list_id);
    recipientCount = count ?? 0;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {campaign.subject}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={status} />
            <span className="text-xs text-slate-500">
              created {new Date(campaign.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        <Link href="/campaigns" className="text-sm text-slate-600 underline">
          Back to campaigns
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {notice}
        </p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4 rounded-md border border-slate-200 bg-white p-4 text-sm">
        <div>
          <dt className="text-xs uppercase text-slate-500">List</dt>
          <dd className="mt-1">{list?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase text-slate-500">Recipients</dt>
          <dd className="mt-1">{recipientCount}</dd>
        </div>
        {campaign.sent_at && (
          <div className="col-span-2">
            <dt className="text-xs uppercase text-slate-500">Sent</dt>
            <dd className="mt-1">
              {new Date(campaign.sent_at).toLocaleString()}
            </dd>
          </div>
        )}
      </dl>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-slate-700">Preview</h2>
        <p className="mt-1 text-xs text-slate-500">
          {'{{name}}'} and {'{{email}}'} are substituted with sample values.
        </p>
        <iframe
          srcDoc={buildPreviewDoc(campaign.html_body ?? '')}
          sandbox=""
          className="mt-2 h-[500px] w-full rounded-md border border-slate-200 bg-white"
          title="Email preview"
        />
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {status === 'draft' && (
          <>
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
            <Link
              href={`/campaigns/${campaign.id}/edit`}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </Link>
          </>
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

function StatusBadge({ status }: { status: Status }) {
  const cls =
    status === 'sent'
      ? 'bg-green-50 text-green-700'
      : status === 'sending'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
