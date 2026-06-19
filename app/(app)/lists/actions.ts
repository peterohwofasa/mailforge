'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function createList(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    redirect('/lists?error=' + encodeURIComponent('Name is required.'));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('lists')
    .insert({ tenant_id: user.id, name })
    .select('id')
    .single();

  if (error || !data) {
    redirect(
      '/lists?error=' + encodeURIComponent(error?.message ?? 'Failed.'),
    );
  }

  revalidatePath('/lists');
  redirect(`/lists/${data.id}`);
}

export async function renameList(formData: FormData) {
  const id = String(formData.get('list_id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!id) redirect('/lists');
  if (!name) {
    redirect(`/lists/${id}?error=` + encodeURIComponent('Name is required.'));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('lists')
    .update({ name })
    .eq('id', id);

  if (error) {
    redirect(`/lists/${id}?error=` + encodeURIComponent(error.message));
  }

  revalidatePath('/lists');
  revalidatePath(`/lists/${id}`);
  redirect(`/lists/${id}?notice=` + encodeURIComponent('Renamed.'));
}

export async function deleteList(formData: FormData) {
  const id = String(formData.get('list_id') ?? '');
  if (!id) redirect('/lists');

  const supabase = await createClient();

  // Detach campaigns first. The schema's FK has no ON DELETE clause, so a raw
  // delete would be blocked. NULLing list_id keeps the campaign's history
  // (subject, body, events, sent_at) intact even after the list is gone.
  const { error: detachError } = await supabase
    .from('campaigns')
    .update({ list_id: null })
    .eq('list_id', id);
  if (detachError) {
    redirect(`/lists/${id}?error=` + encodeURIComponent(detachError.message));
  }

  // list_contacts rows cascade-delete via the FK on list_contacts.list_id.
  const { error: deleteError } = await supabase
    .from('lists')
    .delete()
    .eq('id', id);
  if (deleteError) {
    redirect(`/lists/${id}?error=` + encodeURIComponent(deleteError.message));
  }

  revalidatePath('/lists');
  redirect('/lists?notice=' + encodeURIComponent('List deleted.'));
}

export async function addContactsToList(formData: FormData) {
  const list_id = String(formData.get('list_id') ?? '');
  const contact_ids = formData.getAll('contact_ids').map((v) => String(v));

  if (!list_id) redirect('/lists');
  if (contact_ids.length === 0) {
    redirect(
      `/lists/${list_id}?error=` +
        encodeURIComponent('Pick at least one contact.'),
    );
  }

  const supabase = await createClient();

  // ignoreDuplicates: re-adding an existing member is a no-op, not an error.
  const rows = contact_ids.map((contact_id) => ({ list_id, contact_id }));
  const { error } = await supabase
    .from('list_contacts')
    .upsert(rows, { onConflict: 'list_id,contact_id', ignoreDuplicates: true });

  if (error) {
    redirect(`/lists/${list_id}?error=` + encodeURIComponent(error.message));
  }

  revalidatePath('/lists');
  revalidatePath(`/lists/${list_id}`);
  redirect(
    `/lists/${list_id}?notice=` +
      encodeURIComponent(`Added ${contact_ids.length} contact(s).`),
  );
}

export async function removeContactFromList(formData: FormData) {
  const list_id = String(formData.get('list_id') ?? '');
  const contact_id = String(formData.get('contact_id') ?? '');
  if (!list_id || !contact_id) redirect('/lists');

  const supabase = await createClient();
  const { error } = await supabase
    .from('list_contacts')
    .delete()
    .eq('list_id', list_id)
    .eq('contact_id', contact_id);

  if (error) {
    redirect(`/lists/${list_id}?error=` + encodeURIComponent(error.message));
  }

  revalidatePath('/lists');
  revalidatePath(`/lists/${list_id}`);
  redirect(`/lists/${list_id}`);
}
