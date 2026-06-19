import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createList } from './actions';

export default async function ListsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const supabase = await createClient();

  const [{ data: lists }, { data: memberships }] = await Promise.all([
    supabase
      .from('lists')
      .select('id, name, created_at')
      .order('created_at', { ascending: false }),
    supabase.from('list_contacts').select('list_id'),
  ]);

  const countByList = new Map<string, number>();
  for (const m of memberships ?? []) {
    countByList.set(m.list_id, (countByList.get(m.list_id) ?? 0) + 1);
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
      {notice && (
        <p className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {notice}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-md border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Members</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(lists ?? []).map((l) => (
              <tr key={l.id} className="border-t border-slate-100">
                <td className="px-4 py-2 font-medium">
                  <Link
                    href={`/lists/${l.id}`}
                    className="text-slate-900 hover:underline"
                  >
                    {l.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-600">
                  {countByList.get(l.id) ?? 0}
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {new Date(l.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/lists/${l.id}`}
                    className="text-slate-700 underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {(!lists || lists.length === 0) && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  No lists yet. Create one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
