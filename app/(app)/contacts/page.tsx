import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AddContactsTabs } from './AddContactsTabs';
import { deleteContact } from './actions';

const PAGE_SIZE = 50;
const STATUSES = ['active', 'unsubscribed', 'bounced', 'complained'] as const;
type Status = (typeof STATUSES)[number];

interface SearchParams {
  status?: string;
  q?: string;
  page?: string;
  error?: string;
  notice?: string;
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&');
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status: Status | 'all' =
    sp.status && (STATUSES as readonly string[]).includes(sp.status)
      ? (sp.status as Status)
      : 'all';
  const q = sp.q?.trim() ?? '';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);

  const supabase = await createClient();

  // Status counts — one count(*) per status for the tabs at the top.
  // RLS already scopes each query to this tenant.
  const counts: Record<Status | 'all', number> = {
    all: 0,
    active: 0,
    unsubscribed: 0,
    bounced: 0,
    complained: 0,
  };
  await Promise.all([
    supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => {
        counts.all = count ?? 0;
      }),
    ...STATUSES.map((s) =>
      supabase
        .from('contacts')
        .select('id', { count: 'exact', head: true })
        .eq('status', s)
        .then(({ count }) => {
          counts[s] = count ?? 0;
        }),
    ),
  ]);

  // Main table query: filtered + paginated.
  let query = supabase
    .from('contacts')
    .select('id, email, name, status, source, created_at', { count: 'exact' });
  if (status !== 'all') query = query.eq('status', status);
  if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%`);
  query = query
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data: contacts, count: filteredCount } = await query;

  // Pull every email for the paste-tab live-dedup. 100/day target means this
  // set stays small; revisit if it grows past ~50k.
  const { data: allEmails } = await supabase.from('contacts').select('email');
  const existingEmails = (allEmails ?? []).map((c) => c.email);

  const total = filteredCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>

      <div className="mt-6">
        <AddContactsTabs existingEmails={existingEmails} />
      </div>

      {sp.error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {sp.error}
        </p>
      )}
      {sp.notice && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {sp.notice}
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-1 border-b border-slate-200 text-sm">
        <StatusTab
          label="All"
          count={counts.all}
          href={`/contacts${qs({ q })}`}
          active={status === 'all'}
        />
        {STATUSES.map((s) => (
          <StatusTab
            key={s}
            label={s.charAt(0).toUpperCase() + s.slice(1)}
            count={counts[s]}
            href={`/contacts${qs({ status: s, q })}`}
            active={status === s}
          />
        ))}
      </div>

      <form method="get" className="mt-4 flex flex-wrap gap-2">
        {status !== 'all' && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search email or name…"
          className="flex-1 min-w-[240px] rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Search
        </button>
        {q && (
          <Link
            href={`/contacts${qs({ status: status === 'all' ? undefined : status })}`}
            className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Clear
          </Link>
        )}
      </form>

      <div className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Source</th>
              <th className="px-4 py-2 font-medium">Added</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(contacts ?? []).map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{c.email}</td>
                <td className="px-4 py-2 text-slate-600">{c.name ?? '—'}</td>
                <td className="px-4 py-2 text-slate-600">{c.status}</td>
                <td className="px-4 py-2 text-slate-600">{c.source}</td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(c.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={deleteContact}>
                    <input type="hidden" name="contact_id" value={c.id} />
                    <button
                      type="submit"
                      className="text-xs text-slate-500 underline hover:text-red-700"
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {(!contacts || contacts.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                  {q || status !== 'all'
                    ? 'No contacts match this filter.'
                    : 'No contacts yet. Add some above.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {page} of {totalPages} — {total} contact{total === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <PageLink
              label="← Prev"
              disabled={page <= 1}
              href={`/contacts${qs({
                status: status === 'all' ? undefined : status,
                q,
                page: String(page - 1),
              })}`}
            />
            <PageLink
              label="Next →"
              disabled={page >= totalPages}
              href={`/contacts${qs({
                status: status === 'all' ? undefined : status,
                q,
                page: String(page + 1),
              })}`}
            />
          </div>
        </nav>
      )}
    </main>
  );
}

function StatusTab({
  label,
  count,
  href,
  active,
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`relative -mb-px border-b-2 px-4 py-2 ${
        active
          ? 'border-slate-900 font-medium text-slate-900'
          : 'border-transparent text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}{' '}
      <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
        {count}
      </span>
    </Link>
  );
}

function PageLink({
  label,
  href,
  disabled,
}: {
  label: string;
  href: string;
  disabled: boolean;
}) {
  if (disabled) {
    return (
      <span className="rounded-md border border-slate-200 px-3 py-1.5 text-slate-300">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-50"
    >
      {label}
    </Link>
  );
}
