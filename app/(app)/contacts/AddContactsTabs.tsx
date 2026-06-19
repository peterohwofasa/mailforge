'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addContact, addContactsBatch } from './actions';
import { parseEmails } from '@/lib/email/parse';

type Tab = 'single' | 'paste' | 'import';

interface Props {
  existingEmails: string[];
}

export function AddContactsTabs({ existingEmails }: Props) {
  const [tab, setTab] = useState<Tab>('single');
  const existingSet = useMemo(
    () => new Set(existingEmails.map((e) => e.toLowerCase())),
    [existingEmails],
  );

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="flex border-b border-slate-200 text-sm">
        {(['single', 'paste', 'import'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 font-medium ${
              tab === t
                ? 'border-b-2 border-slate-900 text-slate-900'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'single' && 'Add one'}
            {t === 'paste' && 'Paste emails'}
            {t === 'import' && 'Import file'}
          </button>
        ))}
      </div>

      <div className="p-4">
        {tab === 'single' && <SingleTab />}
        {tab === 'paste' && <PasteTab existingSet={existingSet} />}
        {tab === 'import' && <ImportTab />}
      </div>
    </div>
  );
}

function SingleTab() {
  return (
    <form action={addContact} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-1 min-w-[240px] flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Email</span>
        <input
          name="email"
          type="email"
          required
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </label>
      <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">
          Name <span className="text-slate-400">(optional)</span>
        </span>
        <input
          name="name"
          type="text"
          className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
        />
      </label>
      <button
        type="submit"
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Add
      </button>
    </form>
  );
}

function PasteTab({ existingSet }: { existingSet: Set<string> }) {
  const [input, setInput] = useState('');
  const preview = useMemo(
    () => parseEmails(input, existingSet),
    [input, existingSet],
  );

  return (
    <form action={addContactsBatch} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">Emails</span>
        <textarea
          name="emails"
          rows={6}
          placeholder={'one@example.com, two@example.com\nthree@example.com'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-slate-900"
        />
        <span className="text-xs text-slate-500">
          Separate with commas, semicolons, newlines, or spaces.
        </span>
      </label>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge color="green" label={`${preview.added.length} new`} />
        <Badge color="slate" label={`${preview.duplicates} duplicate`} />
        <Badge color="red" label={`${preview.invalid} invalid`} />
      </div>

      {preview.invalidEmails.length > 0 && (
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer">
            Show invalid ({preview.invalidEmails.length})
          </summary>
          <div className="mt-2 font-mono break-all">
            {preview.invalidEmails.slice(0, 20).join(', ')}
            {preview.invalidEmails.length > 20 && '…'}
          </div>
        </details>
      )}

      <button
        type="submit"
        disabled={preview.added.length === 0}
        className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        Add {preview.added.length}
      </button>
    </form>
  );
}

interface PreviewResp {
  headers: string[];
  sampleRows: Record<string, unknown>[];
  totalRows: number;
  suggestedMapping: { emailColumn: string | null; nameColumn: string | null };
}

interface CommitResp {
  added: number;
  duplicates: number;
  invalid: number;
  invalidEmails: string[];
}

function ImportTab() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [emailCol, setEmailCol] = useState('');
  const [nameCol, setNameCol] = useState('');
  const [result, setResult] = useState<CommitResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(f: File) {
    setError(null);
    setResult(null);
    setFile(f);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('mode', 'preview');
      const res = await fetch('/api/contacts/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to read file.');
        setPreview(null);
        return;
      }
      setPreview(data);
      setEmailCol(data.suggestedMapping.emailColumn ?? data.headers[0] ?? '');
      setNameCol(data.suggestedMapping.nameColumn ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read file.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!file || !emailCol) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', 'commit');
      fd.append('email_column', emailCol);
      if (nameCol) fd.append('name_column', nameCol);
      const res = await fetch('/api/contacts/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Import failed.');
        return;
      }
      setResult(data);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setEmailCol('');
    setNameCol('');
    setResult(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3">
      {!preview && !result && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">CSV or Excel file</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            disabled={busy}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <span className="text-xs text-slate-500">
            Must have a header row with column names. Up to 10,000 rows.
          </span>
        </label>
      )}

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {preview && !result && (
        <>
          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{file?.name}</span> —{' '}
            {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'} detected
          </div>

          <div className="flex flex-wrap gap-3">
            <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Email column</span>
              <select
                value={emailCol}
                onChange={(e) => setEmailCol(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                {preview.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 min-w-[200px] flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">
                Name column <span className="text-slate-400">(optional)</span>
              </span>
              <select
                value={nameCol}
                onChange={(e) => setNameCol(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2"
              >
                <option value="">— none —</option>
                {preview.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {preview.sampleRows.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-slate-200 text-xs">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    {preview.headers.map((h) => (
                      <th
                        key={h}
                        className={`px-2 py-1 text-left font-medium ${
                          h === emailCol ? 'text-green-700' : 'text-slate-600'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleRows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {preview.headers.map((h) => (
                        <td key={h} className="px-2 py-1 text-slate-700">
                          {String(row[h] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCommit}
              disabled={busy || !emailCol}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
            >
              {busy ? 'Importing…' : `Import ${preview.totalRows} row(s)`}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Imported {result.added}. Skipped {result.duplicates} duplicate(s),{' '}
            {result.invalid} invalid.
          </div>
          {result.invalidEmails.length > 0 && (
            <details className="text-xs text-slate-600">
              <summary className="cursor-pointer">
                Show first {result.invalidEmails.length} invalid
              </summary>
              <div className="mt-2 font-mono break-all">
                {result.invalidEmails.join(', ')}
              </div>
            </details>
          )}
          <button
            type="button"
            onClick={reset}
            className="self-start rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Import another
          </button>
        </div>
      )}
    </div>
  );
}

function Badge({
  color,
  label,
}: {
  color: 'green' | 'slate' | 'red';
  label: string;
}) {
  const cls =
    color === 'green'
      ? 'bg-green-50 text-green-700'
      : color === 'red'
        ? 'bg-red-50 text-red-700'
        : 'bg-slate-100 text-slate-700';
  return (
    <span className={`rounded-md px-2 py-1 font-medium ${cls}`}>{label}</span>
  );
}
