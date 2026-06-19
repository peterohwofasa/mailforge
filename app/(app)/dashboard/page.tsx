import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-sm text-slate-600">
        Signed in as <span className="font-medium">{user?.email}</span>.
      </p>
      <p className="mt-6 text-sm text-slate-500">
        Stats, contacts, and campaigns land here in later phases.
      </p>
    </main>
  );
}
