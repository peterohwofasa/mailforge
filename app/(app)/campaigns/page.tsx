import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

type Status = 'draft' | 'sending' | 'sent';

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

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, subject, status, created_at, sent_at, list:lists(name)')
    .order('created_at', { ascending: false });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <Link
          href="/campaigns/new"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          New campaign
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-md border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Subject</th>
              <th className="px-4 py-2 font-medium">List</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium">Sent</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(campaigns ?? []).map((c) => {
              const list = c.list as unknown as { name: string } | null;
              return (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{c.subject}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {list?.name ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={c.status as Status} />
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {new Date(c.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {c.sent_at ? new Date(c.sent_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="text-slate-700 underline"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(!campaigns || campaigns.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  No campaigns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
