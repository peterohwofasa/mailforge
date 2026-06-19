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

  const { error } = await supabase
    .from('lists')
    .insert({ tenant_id: user.id, name });

  if (error) {
    redirect('/lists?error=' + encodeURIComponent(error.message));
  }

  revalidatePath('/lists');
  redirect('/lists');
}

export async function addContactToList(formData: FormData) {
  const list_id = String(formData.get('list_id') ?? '');
  const contact_id = String(formData.get('contact_id') ?? '');

  if (!list_id || !contact_id) {
    redirect(
      '/lists?error=' + encodeURIComponent('List and contact are required.'),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS on list_contacts checks the parent list belongs to auth.uid().
  // Duplicate adds violate the PK and surface as an error in searchParams.
  const { error } = await supabase
    .from('list_contacts')
    .insert({ list_id, contact_id });

  if (error) {
    redirect('/lists?error=' + encodeURIComponent(error.message));
  }

  revalidatePath('/lists');
  redirect('/lists');
}
