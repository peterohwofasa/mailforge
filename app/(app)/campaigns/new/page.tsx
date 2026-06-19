import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { CampaignEditor } from '../CampaignEditor';
import { TEMPLATES } from '@/lib/templates';

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: lists }, { data: tenant }] = await Promise.all([
    supabase
      .from('lists')
      .select('id, name')
      .order('created_at', { ascending: false }),
    supabase
      .from('tenants')
      .select('from_name, from_email, reply_to_email')
      .single(),
  ]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
        <Link href="/campaigns" className="text-sm text-slate-600 underline">
          Back to campaigns
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6">
        <CampaignEditor
          mode="new"
          initial={{
            subject: '',
            html_body: '',
            plain_text_body: '',
            from_name: '',
            from_email: '',
            reply_to: '',
            list_id: '',
          }}
          lists={lists ?? []}
          templates={TEMPLATES}
          tenantDefaults={{
            from_name: tenant?.from_name ?? '',
            from_email: tenant?.from_email ?? '',
            reply_to_email: tenant?.reply_to_email ?? '',
          }}
        />
      </div>
    </main>
  );
}
