import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/email/tokens';
import { createAdminClient } from '@/lib/supabase/admin';

// RFC 8058 one-click unsubscribe.
// Mail clients (Gmail, Yahoo, etc.) POST here with body `List-Unsubscribe=One-Click`.
// The token is in the query string because the URL itself identifies the recipient.
//
// Public endpoint — runs with the service-role key. The HMAC signature on the
// token is the auth: only the server (which knows UNSUBSCRIBE_TOKEN_SECRET)
// could have produced a valid token.
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'missing token' }, { status: 400 });
  }

  const payload = verifyUnsubscribeToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Record a 'complained' event when we have campaign context — useful for the
  // suspend guard (one-click unsubs are a stronger signal than a manual click
  // since the user used their mail client's report-spam-style affordance).
  const { data: contact } = await admin
    .from('contacts')
    .select('tenant_id, status')
    .eq('id', payload.c)
    .single();

  if (!contact) {
    return NextResponse.json({ error: 'unknown contact' }, { status: 404 });
  }

  await admin
    .from('contacts')
    .update({ status: 'unsubscribed' })
    .eq('id', payload.c);

  return new NextResponse(null, { status: 200 });
}
