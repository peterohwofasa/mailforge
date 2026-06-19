import { createClient } from '@/lib/supabase/server';
import { createList, addContactToList } from './actions';

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: lists }, { data: contacts }, { data: memberships }] =
    await Promise.all([
      supabase
        .from('lists')
        .select('id, name, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('contacts')
        .select('id, email, name, status')
        .eq('status', 'active')
        .order('email'),
      supabase
        .from('list_contacts')
        .select('list_id, contact:contacts(id, email, name)'),
    ]);

  // Group memberships by list_id for fast lookup in render.
  const byList = new Map<string, Array<{ id: string; email: string; name: string | null }>>();
  for (const row of memberships ?? []) {
    const arr = byList.get(row.list_id) ?? [];
    // The Supabase typed shape gives `contact` as the joined row; narrow defensively.
    const c = row.contact as unknown as { id: string; email: string; name: string | null } | null;
    if (c) arr.push(c);
    byList.set(row.list_id, arr);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Lists</h1>

      <form
        action={createList}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-4"
      >
        <label className="flex flex-1 min-w-[240px] flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">List name</span>
          <input
            name="name"
            type="text"
            required
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Create
        </button>
      </form>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6 space-y-4">
        {(lists ?? []).map((list) => {
          const members = byList.get(list.id) ?? [];
          return (
            <section
              key={list.id}
              className="rounded-md border border-slate-200 bg-white p-4"
            >
              <header className="flex items-center justify-between">
                <h2 className="text-base font-medium">{list.name}</h2>
                <span className="text-xs text-slate-500">
                  {members.length} contact{members.length === 1 ? '' : 's'}
                </span>
              </header>

              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {members.map((m) => (
                  <li key={m.id}>
                    {m.email}
                    {m.name ? ` — ${m.name}` : ''}
                  </li>
                ))}
                {members.length === 0 && (
                  <li className="text-slate-400">No contacts in this list yet.</li>
                )}
              </ul>

              <form
                action={addContactToList}
                className="mt-3 flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="list_id" value={list.id} />
                <label className="flex flex-1 min-w-[240px] flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Add contact</span>
                  <select
                    name="contact_id"
                    required
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
                  >
                    <option value="">Select a contact…</option>
                    {(contacts ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.email}
                        {c.name ? ` (${c.name})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Add to list
                </button>
              </form>
            </section>
          );
        })}
        {(!lists || lists.length === 0) && (
          <p className="rounded-md border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            No lists yet. Create one above.
          </p>
        )}
      </div>
    </main>
  );
}
