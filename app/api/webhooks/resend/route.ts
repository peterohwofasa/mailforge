import { NextRequest, NextResponse } from 'next/server';

// Phase-3 stub. Phase 8 verifies the Svix signature and maps event types
// (email.delivered/opened/clicked/bounced/complained) into the events table.
export async function POST(req: NextRequest) {
  const body = await req.text();
  console.log('[resend webhook]', body);
  return NextResponse.json({ ok: true });
}
