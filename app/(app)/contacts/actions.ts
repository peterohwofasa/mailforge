'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { parseEmails } from '@/lib/email/parse';

export async function addContact(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim() || null;

  if (!email) {
    redirect('/contacts?error=' + encodeURIComponent('Email is required.'));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.from('contacts').insert({
    tenant_id: user.id,
    email,
    name,
    source: 'manual',
  });

  if (error) {
    redirect('/contacts?error=' + encodeURIComponent(error.message));
  }

  revalidatePath('/contacts');
  redirect('/contacts');
}

export async function addContactsBatch(formData: FormData) {
  const input = String(formData.get('emails') ?? '');

  if (!input.trim()) {
    redirect('/contacts?error=' + encodeURIComponent('Paste at least one email.'));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Load all existing emails for case-insensitive dedup. RLS scopes to this tenant.
  const { data: existing } = await supabase.from('contacts').select('email');
  const existingSet = new Set(
    (existing ?? []).map((c) => c.email.toLowerCase()),
  );

  const parsed = parseEmails(input, existingSet);

  if (parsed.added.length === 0) {
    redirect(
      '/contacts?notice=' +
        encodeURIComponent(
          `Nothing added. ${parsed.duplicates} duplicate(s), ${parsed.invalid} invalid.`,
        ),
    );
  }

  const rows = parsed.added.map((email) => ({
    tenant_id: user.id,
    email,
    source: 'paste' as const,
  }));

  const { error } = await supabase.from('contacts').insert(rows);

  if (error) {
    redirect('/contacts?error=' + encodeURIComponent(error.message));
  }

  revalidatePath('/contacts');
  redirect(
    '/contacts?notice=' +
      encodeURIComponent(
        `Added ${parsed.added.length}. Skipped ${parsed.duplicates} duplicate(s), ${parsed.invalid} invalid.`,
      ),
  );
}

export async function deleteContact(formData: FormData) {
  const id = String(formData.get('contact_id') ?? '');
  if (!id) redirect('/contacts');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS keeps a foreign tenant from deleting someone else's contact.
  const { error } = await supabase.from('contacts').delete().eq('id', id);

  if (error) {
    redirect('/contacts?error=' + encodeURIComponent(error.message));
  }

  revalidatePath('/contacts');
  redirect('/contacts');
}
