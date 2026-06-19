// Phase-3 placeholder. Phase 7 verifies the HMAC token, flips the contact's
// status to 'unsubscribed', and adds the RFC 8058 one-click POST endpoint.
export default async function UnsubscribePlaceholder({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await params;
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md rounded-md border border-slate-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Unsubscribe</h1>
        <p className="mt-3 text-sm text-slate-600">
          One-click unsubscribe is being wired up. Reply to the email with
          UNSUBSCRIBE in the meantime.
        </p>
      </div>
    </main>
  );
}
