'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Seed values for the tenant row created alongside every new auth user.
// v1 is single-user, so these are static; Phase 9 (Settings) lets the owner edit them.
const TENANT_SEED = {
  name: 'MailForge',
  from_name: 'MailForge',
  from_email: 'onboarding@resend.dev',
  reply_to_email: 'peohwofasa17@gmail.com',
  physical_address: '123 Placeholder St, Johannesburg, South Africa',
};

export async function register(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    redirect(
      '/register?error=' +
        encodeURIComponent('Email and password are required.'),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error || !data.user) {
    redirect(
      '/register?error=' + encodeURIComponent(error?.message ?? 'Sign up failed.'),
    );
  }

  // Insert the tenant row via the service-role client so it succeeds whether or
  // not the session is yet active (email confirmation may delay session creation).
  const admin = createAdminClient();
  const { error: tenantError } = await admin
    .from('tenants')
    .insert({ id: data.user.id, ...TENANT_SEED });

  if (tenantError) {
    redirect(
      '/register?error=' +
        encodeURIComponent('Profile setup failed: ' + tenantError.message),
    );
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
