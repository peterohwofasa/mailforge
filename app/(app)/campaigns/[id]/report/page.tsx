import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function CampaignReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, subject, status, sent_at')
    .eq('id', id)
    .single();
  if (!campaign) notFound();

  const { data: events } = await supabase
    .from('events')
    .select(
      'id, type, resend_email_id, created_at, metadata, contact:contacts(email)',
    )
    .eq('campaign_id', id)
    .order('created_at', { ascending: false });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {campaign.subject}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Status: {campaign.status}
            {campaign.sent_at
              ? ` · sent ${new Date(campaign.sent_at).toLocaleString()}`
              : ''}
          </p>
        </div>
        <Link
          href={`/campaigns/${campaign.id}`}
          className="text-sm text-slate-600 underline"
        >
          Back to campaign
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-md border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">Recipient</th>
              <th className="px-4 py-2 font-medium">Resend ID</th>
              <th className="px-4 py-2 font-medium">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {(events ?? []).map((e) => {
              const c = e.contact as unknown as { email: string } | null;
              return (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-medium">{e.type}</td>
                  <td className="px-4 py-2">{c?.email ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">
                    {e.resend_email_id ?? '—'}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">
                    {e.metadata && Object.keys(e.metadata).length > 0
                      ? JSON.stringify(e.metadata)
                      : '—'}
                  </td>
                </tr>
              );
            })}
            {(!events || events.length === 0) && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No events yet. Webhook deliveries will appear here once the
                  webhook is wired up in Phase 8.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
