import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseEmails } from '@/lib/email/parse';

const MAX_ROWS = 10_000;
const SAMPLE_ROWS = 5;

type Row = Record<string, unknown>;

interface PreviewResponse {
  headers: string[];
  sampleRows: Row[];
  totalRows: number;
  suggestedMapping: { emailColumn: string | null; nameColumn: string | null };
}

interface CommitResponse {
  added: number;
  duplicates: number;
  invalid: number;
  invalidEmails: string[];
}

function suggestColumn(headers: string[], match: string): string | null {
  const idx = headers.findIndex((h) => h.toLowerCase().includes(match));
  return idx >= 0 ? headers[idx] : null;
}

async function parseFile(file: File): Promise<{ headers: string[]; rows: Row[] }> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    // exceljs types resolve a Buffer shape that requires newer fields than
    // Node's Buffer.from() currently advertises in its generic return type.
    // The value is structurally fine — just override the type-check.
    // @ts-expect-error -- exceljs Buffer typing lag
    await wb.xlsx.load(buffer);
    const sheet = wb.worksheets[0];
    if (!sheet) return { headers: [], rows: [] };

    // ExcelJS row.values is 1-indexed (slot 0 is always null/empty).
    const allRows: unknown[][] = [];
    sheet.eachRow((row) => {
      const vals = row.values as unknown[];
      allRows.push(vals.slice(1));
    });

    if (allRows.length === 0) return { headers: [], rows: [] };

    const headers = (allRows[0] ?? []).map((h) => String(h ?? '').trim());
    const rows: Row[] = [];
    for (const r of allRows.slice(1, MAX_ROWS + 1)) {
      const obj: Row = {};
      headers.forEach((h, i) => {
        const v = r[i];
        obj[h] =
          v === null || v === undefined ? '' : typeof v === 'object' ? String(v) : v;
      });
      rows.push(obj);
    }
    return { headers, rows };
  }

  // Default: CSV.
  const text = buffer.toString('utf-8').replace(/^﻿/, ''); // strip BOM
  const Papa = (await import('papaparse')).default;
  const result = Papa.parse<Row>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  const headers = (result.meta.fields ?? []).map((h) => h.trim());
  const rows = result.data.slice(0, MAX_ROWS);
  return { headers, rows };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  const mode = String(form.get('mode') ?? 'preview');

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }

  let parsed: { headers: string[]; rows: Row[] };
  try {
    parsed = await parseFile(file);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to parse file.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { headers, rows } = parsed;
  if (headers.length === 0) {
    return NextResponse.json(
      { error: 'No columns detected. Make sure the file has a header row.' },
      { status: 400 },
    );
  }

  const suggestedMapping = {
    emailColumn: suggestColumn(headers, 'email') ?? headers[0] ?? null,
    nameColumn: suggestColumn(headers, 'name'),
  };

  if (mode === 'preview') {
    const body: PreviewResponse = {
      headers,
      sampleRows: rows.slice(0, SAMPLE_ROWS),
      totalRows: rows.length,
      suggestedMapping,
    };
    return NextResponse.json(body);
  }

  // mode === 'commit'
  const emailColumn = String(form.get('email_column') ?? '');
  const nameColumn = String(form.get('name_column') ?? '');

  if (!emailColumn || !headers.includes(emailColumn)) {
    return NextResponse.json(
      { error: 'Pick a valid email column.' },
      { status: 400 },
    );
  }

  // Extract emails + optional names, holding onto the name for each email so we
  // can attach it on insert. parseEmails dedupes — we use the first name seen.
  const nameByEmail = new Map<string, string>();
  const emailLines: string[] = [];
  for (const row of rows) {
    const e = String(row[emailColumn] ?? '').trim().toLowerCase();
    if (!e) continue;
    emailLines.push(e);
    if (nameColumn && headers.includes(nameColumn) && !nameByEmail.has(e)) {
      const n = String(row[nameColumn] ?? '').trim();
      if (n) nameByEmail.set(e, n);
    }
  }

  const { data: existing } = await supabase.from('contacts').select('email');
  const existingSet = new Set(
    (existing ?? []).map((c) => c.email.toLowerCase()),
  );

  const result = parseEmails(emailLines.join('\n'), existingSet);

  if (result.added.length > 0) {
    const insertRows = result.added.map((email) => ({
      tenant_id: user.id,
      email,
      name: nameByEmail.get(email) ?? null,
      source: 'import' as const,
    }));

    // Insert in chunks so a 10k import doesn't blow past Postgres parameter limits.
    const CHUNK = 500;
    for (let i = 0; i < insertRows.length; i += CHUNK) {
      const { error } = await supabase
        .from('contacts')
        .insert(insertRows.slice(i, i + CHUNK));
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  const body: CommitResponse = {
    added: result.added.length,
    duplicates: result.duplicates,
    invalid: result.invalid,
    invalidEmails: result.invalidEmails.slice(0, 20),
  };
  return NextResponse.json(body);
}
