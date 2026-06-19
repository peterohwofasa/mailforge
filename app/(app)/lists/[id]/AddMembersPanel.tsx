'use client';

import { useMemo, useState } from 'react';
import { addContactsToList } from '../actions';

interface Contact {
  id: string;
  email: string;
  name: string | null;
  status: string;
}

interface Props {
  listId: string;
  nonMembers: Contact[];
}

const VISIBLE_LIMIT = 200;

export function AddMembersPanel({ listId, nonMembers }: Props) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nonMembers;
    return nonMembers.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        (c.name ? c.name.toLowerCase().includes(q) : false),
    );
  }, [search, nonMembers]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.slice(0, VISIBLE_LIMIT).forEach((c) => next.add(c.id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  if (nonMembers.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-500">
        All your contacts are already in this list.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or name…"
          className="flex-1 min-w-[200px] rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
        />
        <button
          type="button"
          onClick={selectAllVisible}
          className="text-xs text-slate-600 underline hover:text-slate-900"
        >
          Select all visible
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            className="text-xs text-slate-600 underline hover:text-slate-900"
          >
            Clear ({selected.size})
          </button>
        )}
      </div>

      <ul className="mt-3 max-h-80 overflow-y-auto rounded-md border border-slate-200">
        {filtered.slice(0, VISIBLE_LIMIT).map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0"
          >
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              id={`m-${c.id}`}
              className="h-4 w-4 cursor-pointer"
            />
            <label
              htmlFor={`m-${c.id}`}
              className="flex flex-1 cursor-pointer items-center justify-between text-sm"
            >
              <span>
                {c.email}
                {c.name && (
                  <span className="ml-2 text-slate-500">{c.name}</span>
                )}
              </span>
              <StatusPill status={c.status} />
            </label>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-slate-500">
            No contacts match &ldquo;{search}&rdquo;.
          </li>
        )}
        {filtered.length > VISIBLE_LIMIT && (
          <li className="border-t border-slate-100 px-3 py-2 text-center text-xs text-slate-500">
            Showing first {VISIBLE_LIMIT} of {filtered.length}. Refine the search
            to narrow.
          </li>
        )}
      </ul>

      <form action={addContactsToList} className="mt-3">
        <input type="hidden" name="list_id" value={listId} />
        {[...selected].map((id) => (
          <input key={id} type="hidden" name="contact_ids" value={id} />
        ))}
        <button
          type="submit"
          disabled={selected.size === 0}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          Add {selected.size} contact{selected.size === 1 ? '' : 's'} to list
        </button>
      </form>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === 'active'
      ? 'bg-green-50 text-green-700'
      : status === 'bounced'
        ? 'bg-red-50 text-red-700'
        : status === 'complained'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-600';
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}
