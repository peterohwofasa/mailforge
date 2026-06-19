import Link from 'next/link';
import { TEMPLATES } from '@/lib/templates';
import { buildPreviewDoc } from '@/lib/preview';

export default function TemplatesPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
      <p className="mt-2 text-sm text-slate-600">
        Five CSS-inlined starting points. Pick one in the campaign editor to
        load it into the HTML body, then customise.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {TEMPLATES.map((t) => (
          <article
            key={t.id}
            className="overflow-hidden rounded-md border border-slate-200 bg-white"
          >
            <header className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-medium">{t.name}</h2>
              <p className="mt-1 text-xs text-slate-500">{t.description}</p>
            </header>
            <iframe
              srcDoc={buildPreviewDoc(t.html)}
              sandbox=""
              className="h-72 w-full bg-slate-50"
              title={`${t.name} preview`}
            />
          </article>
        ))}
      </div>

      <p className="mt-6 text-sm text-slate-600">
        <Link href="/campaigns/new" className="text-slate-900 underline">
          Start a new campaign
        </Link>{' '}
        to use a template.
      </p>
    </main>
  );
}
