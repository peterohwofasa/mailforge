import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  renameList,
  deleteList,
  removeContactFromList,
} from '../actions';
import { AddMembersPanel } from './AddMembersPanel';

type Status = 'active' | 'unsubscribed' | 'bounced' | 'complained';

interface MemberContact {
  id: string;
  email: string;
  name: string | null;
  status: Status;
}

export default async function ListDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const supabase = await createClient();

  const { data: list } = await supabase
    .from('lists')
    .select('id, name, created_at')
    .eq('id', id)
    .single();
  if (!list) notFound();

  const [{ data: memberships }, { data: allContacts }, { data: campaigns }] =
    await Promise.all([
      supabase
        .from('list_contacts')
        .select('contact:contacts(id, email, name, status)')
        .eq('list_id', id),
      supabase
        .from('contacts')
        .select('id, email, name, status')
        .order('email'),
      supabase
        .from('campaigns')
        .select('id, subject, status')
        .eq('list_id', id),
    ]);

  const members: MemberContact[] = (memberships ?? [])
    .map(
      (m) =>
        m.contact as unknown as MemberContact | null,
    )
    .filter((c): c is MemberContact => !!c)
    .sort((a, b) => a.email.localeCompare(b.email));

  const memberIds = new Set(members.map((m) => m.id));
  const nonMembers = (allContacts ?? []).filter((c) => !memberIds.has(c.id));

  const breakdown: Record<Status, number> = {
    active: 0,
    unsubscribed: 0,
    bounced: 0,
    complained: 0,
  };
  for (const m of members) {
    if (m.status in breakdown) breakdown[m.status] += 1;
  }

  const referencingCampaigns = campaigns ?? [];
  const sentCampaignCount = referencingCampaigns.filter(
    (c) => c.status === 'sent',
  ).length;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{list.name}</h1>
        <Link href="/lists" className="text-sm text-slate-600 underline">
          Back to lists
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

      <form
        action={renameList}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-4"
      >
        <input type="hidden" name="list_id" value={list.id} />
        <label className="flex flex-1 min-w-[240px] flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">List name</span>
          <input
            name="name"
            type="text"
            required
            defaultValue={list.name}
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Save name
        </button>
      </form>

      <section className="mt-6 grid gap-4 rounded-md border border-slate-200 bg-white p-4 md:grid-cols-2">
        <div>
          <h3 className="text-xs uppercase text-slate-500">Status breakdown</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge color="green">{breakdown.active} active</Badge>
            <Badge color="slate">
              {breakdown.unsubscribed} unsubscribed
            </Badge>
            <Badge color="red">{breakdown.bounced} bounced</Badge>
            <Badge color="amber">{breakdown.complained} complained</Badge>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Sends only deliver to the {breakdown.active} active contact
            {breakdown.active === 1 ? '' : 's'}.
          </p>
        </div>

        <div>
          <h3 className="text-xs uppercase text-slate-500">Danger zone</h3>
          {referencingCampaigns.length > 0 ? (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Used by {referencingCampaigns.length} campaign
              {referencingCampaigns.length === 1 ? '' : 's'}
              {sentCampaignCount > 0
                ? ` (${sentCampaignCount} sent)`
                : ''}
              . Deleting detaches them — the campaign records (subject, body,
              events, sent date) are preserved.
            </p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              Not used by any campaign.
            </p>
          )}
          <form action={deleteList} className="mt-2">
            <input type="hidden" name="list_id" value={list.id} />
            <button
              type="submit"
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Delete list
            </button>
          </form>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-slate-700">
          Members ({members.length})
        </h2>
        <div className="mt-2 overflow-hidden rounded-md border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{m.email}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {m.name ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={removeContactFromList}>
                      <input type="hidden" name="list_id" value={list.id} />
                      <input type="hidden" name="contact_id" value={m.id} />
                      <button
                        type="submit"
                        className="text-xs text-slate-500 underline hover:text-red-700"
                      >
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No members yet. Use the panel below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-medium text-slate-700">Add contacts</h2>
        <div className="mt-2">
          <AddMembersPanel listId={list.id} nonMembers={nonMembers} />
        </div>
      </section>
    </main>
  );
}

function Badge({
  color,
  children,
}: {
  color: 'green' | 'slate' | 'red' | 'amber';
  children: React.ReactNode;
}) {
  const cls =
    color === 'green'
      ? 'bg-green-50 text-green-700'
      : color === 'red'
        ? 'bg-red-50 text-red-700'
        : color === 'amber'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded-md px-2 py-1 font-medium ${cls}`}>{children}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active'
      ? 'bg-green-50 text-green-700'
      : status === 'bounced'
        ? 'bg-red-50 text-red-700'
        : status === 'complained'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
