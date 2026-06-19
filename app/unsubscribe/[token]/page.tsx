import { verifyUnsubscribeToken } from '@/lib/email/tokens';
import { createAdminClient } from '@/lib/supabase/admin';

// Always run on the server, never cached — the token in the URL identifies a
// single recipient, and the page's act of rendering performs the unsubscribe.
export const dynamic = 'force-dynamic';

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyUnsubscribeToken(token);

  if (!payload) {
    return (
      <Shell title="Invalid link">
        <p className="text-sm text-slate-600">
          This unsubscribe link is invalid or has been tampered with.
        </p>
      </Shell>
    );
  }

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from('contacts')
    .select('id, email, status')
    .eq('id', payload.c)
    .single();

  if (!contact) {
    return (
      <Shell title="Already unsubscribed">
        <p className="text-sm text-slate-600">
          We couldn&rsquo;t find this contact, but you won&rsquo;t hear from us
          again.
        </p>
      </Shell>
    );
  }

  if (contact.status !== 'unsubscribed') {
    await admin
      .from('contacts')
      .update({ status: 'unsubscribed' })
      .eq('id', contact.id);
  }

  return (
    <Shell title="You're unsubscribed">
      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-900">{contact.email}</span> has
        been removed from this sender&rsquo;s list. It can take a few minutes
        for any in-flight messages to stop.
      </p>
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-md border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-3">{children}</div>
      </div>
    </main>
  );
}
