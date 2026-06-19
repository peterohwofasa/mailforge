'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCampaign } from './new/actions';
import { updateCampaign } from './[id]/actions';
import { buildPreviewDoc } from '@/lib/preview';
import type { EmailTemplate } from '@/lib/templates';

interface InitialValues {
  subject: string;
  html_body: string;
  plain_text_body: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  list_id: string;
}

interface TenantDefaults {
  from_name: string;
  from_email: string;
  reply_to_email: string;
}

interface Props {
  mode: 'new' | 'edit';
  campaignId?: string;
  initial: InitialValues;
  lists: Array<{ id: string; name: string }>;
  templates: EmailTemplate[];
  tenantDefaults: TenantDefaults;
}

type EditorTab = 'html' | 'text' | 'preview';

export function CampaignEditor({
  mode,
  campaignId,
  initial,
  lists,
  templates,
  tenantDefaults,
}: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState(initial.subject);
  const [htmlBody, setHtmlBody] = useState(initial.html_body);
  const [plainBody, setPlainBody] = useState(initial.plain_text_body);
  const [fromName, setFromName] = useState(initial.from_name);
  const [fromEmail, setFromEmail] = useState(initial.from_email);
  const [replyTo, setReplyTo] = useState(initial.reply_to);
  const [listId, setListId] = useState(initial.list_id);
  const [tab, setTab] = useState<EditorTab>('html');
  const [aiOpen, setAiOpen] = useState(false);

  const previewDoc = useMemo(() => buildPreviewDoc(htmlBody), [htmlBody]);

  const formAction = mode === 'new' ? createCampaign : updateCampaign;

  return (
    <form action={formAction} className="space-y-5">
      {mode === 'edit' && campaignId && (
        <input type="hidden" name="campaign_id" value={campaignId} />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 min-w-[300px] flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Subject</span>
          <input
            name="subject"
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
        >
          ✨ Write with AI
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">From name</span>
          <input
            name="from_name"
            type="text"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder={tenantDefaults.from_name || '(tenant default)'}
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">From email</span>
          <input
            name="from_email"
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder={tenantDefaults.from_email || '(tenant default)'}
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">Reply-to</span>
          <input
            name="reply_to"
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder={tenantDefaults.reply_to_email || '(tenant default)'}
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">List</span>
        <select
          name="list_id"
          required
          value={listId}
          onChange={(e) => setListId(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-slate-900"
        >
          <option value="">Select a list…</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-medium uppercase text-slate-500">
          Start from a template
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (
                  !htmlBody.trim() ||
                  confirm('Replace the current HTML body with this template?')
                ) {
                  setHtmlBody(t.html);
                }
              }}
              title={t.description}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 text-sm">
          <div className="flex gap-1">
            {(['html', 'text', 'preview'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-3 py-2 font-medium ${
                  tab === t
                    ? 'border-b-2 border-slate-900 text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'html' && 'HTML'}
                {t === 'text' && 'Plain text'}
                {t === 'preview' && 'Preview'}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500">
            {tab === 'html' &&
              'Use {{name}} and {{email}} for personalization.'}
            {tab === 'text' && 'Leave blank to auto-generate from the HTML.'}
            {tab === 'preview' && 'Tokens substituted with sample values.'}
          </span>
        </div>

        <div className="p-3">
          {/* Both textareas stay mounted so the form always carries both values. */}
          <textarea
            name="html_body"
            required
            value={htmlBody}
            onChange={(e) => setHtmlBody(e.target.value)}
            rows={16}
            placeholder='<h1>Hello {{name}}</h1><p>Body…</p>'
            className={`w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-slate-900 ${
              tab === 'html' ? '' : 'hidden'
            }`}
          />
          <textarea
            name="plain_text_body"
            value={plainBody}
            onChange={(e) => setPlainBody(e.target.value)}
            rows={16}
            placeholder="Optional plain-text version. Leave blank to auto-generate from HTML."
            className={`w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-slate-900 ${
              tab === 'text' ? '' : 'hidden'
            }`}
          />
          {tab === 'preview' && (
            <iframe
              srcDoc={previewDoc}
              sandbox=""
              className="h-96 w-full rounded-md border border-slate-200 bg-white"
              title="Email preview"
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          {mode === 'new' ? 'Create campaign' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/campaigns')}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>

      {aiOpen && (
        <AIDialog
          onClose={() => setAiOpen(false)}
          onResult={(r) => {
            setSubject(r.subject);
            setHtmlBody(r.body);
            setAiOpen(false);
          }}
        />
      )}
    </form>
  );
}

function AIDialog({
  onClose,
  onResult,
}: {
  onClose: () => void;
  onResult: (r: { subject: string; body: string }) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Generation failed.');
        return;
      }
      onResult({ subject: data.subject, body: data.body });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-md bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight">Write with AI</h2>
        <p className="mt-1 text-sm text-slate-600">
          Describe your email in a sentence or two. Claude will draft a subject
          and HTML body.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          autoFocus
          placeholder="A friendly weekly newsletter announcing a 25% discount on Friday only…"
          className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        {error && (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || !prompt.trim()}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
          >
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Replaces the subject and HTML body fields. Up to 10 generations per
          minute.
        </p>
      </div>
    </div>
  );
}
