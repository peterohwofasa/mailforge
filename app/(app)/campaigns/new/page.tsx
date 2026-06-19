import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createCampaign } from './actions';

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: lists } = await supabase
    .from('lists')
    .select('id, name')
    .order('created_at', { ascending: false });

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
        <Link href="/campaigns" className="text-sm text-slate-600 underline">
          Back to campaigns
        </Link>
      </div>

      <form
        action={createCampaign}
        className="mt-6 flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-6"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Subject</span>
          <input
            name="subject"
            type="text"
            required
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">List</span>
          <select
            name="list_id"
            required
            className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
          >
            <option value="">Select a list…</option>
            {(lists ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">HTML body</span>
          <textarea
            name="html_body"
            required
            rows={12}
            placeholder='<h1>Hello {{name}}</h1><p>Body of the email…</p>'
            className="rounded-md border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-slate-900"
          />
          <span className="text-xs text-slate-500">
            Use <code>{'{{name}}'}</code> and <code>{'{{email}}'}</code> for
            personalization. An unsubscribe link + your physical address are
            appended automatically.
          </span>
        </label>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Create campaign
        </button>
      </form>
    </main>
  );
}
