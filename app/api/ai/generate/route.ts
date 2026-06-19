import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { anthropic, CLAUDE_MODEL } from '@/lib/anthropic';
import { checkRateLimit } from '@/lib/rate-limit';

const SYSTEM_PROMPT = `You are an email-marketing copywriter for a small sender (~100 recipients per day). Given a short description, return a compelling subject line and a clean HTML body.

Requirements for the HTML body:
- All CSS must be INLINE on each element (style="..."). NO <style> blocks — Outlook strips them.
- Max width 600px. Use Arial/Helvetica system fallback fonts for cross-client safety.
- Use {{name}} where personalisation reads naturally.
- Do NOT include an unsubscribe link or physical address — the platform appends them automatically.
- No scripts, no external CSS, no <html>/<head>/<body> wrappers — emit just the body content.

Voice: warm, direct, conversational. Lead with the reader's benefit. Short paragraphs.

Always call the create_email tool with your final subject and body.`;

const EMAIL_TOOL: Anthropic.Tool = {
  name: 'create_email',
  description: 'Submit a marketing email subject line and HTML body.',
  input_schema: {
    type: 'object',
    properties: {
      subject: {
        type: 'string',
        description:
          'Compelling, specific subject line under 60 characters. No clickbait or excessive emoji.',
      },
      body: {
        type: 'string',
        description:
          'HTML email body with ALL CSS inlined (style attributes). Up to 600px wide. No <style> blocks, no script tags, no html/head/body wrappers.',
      },
    },
    required: ['subject', 'body'],
  },
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 10 requests per 60s per user.
  const limit = checkRateLimit(`ai:${user.id}`, 10, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Rate limit reached. Try again in ${limit.retryAfter ?? 60}s.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfter ?? 60) },
      },
    );
  }

  let prompt: string;
  try {
    const body = await req.json();
    prompt = String(body?.prompt ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json(
      { error: 'prompt is required.' },
      { status: 400 },
    );
  }
  if (prompt.length > 2000) {
    return NextResponse.json(
      { error: 'prompt too long — keep it under 2000 characters.' },
      { status: 400 },
    );
  }

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [EMAIL_TOOL],
      tool_choice: { type: 'tool', name: 'create_email' },
      messages: [{ role: 'user', content: prompt }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === 'tool_use' && b.name === 'create_email',
    );

    if (
      !toolUse ||
      typeof toolUse.input !== 'object' ||
      toolUse.input === null
    ) {
      return NextResponse.json(
        { error: 'AI did not return a structured email. Try a clearer prompt.' },
        { status: 502 },
      );
    }

    const { subject, body } = toolUse.input as {
      subject?: string;
      body?: string;
    };
    if (!subject || !body) {
      return NextResponse.json(
        { error: 'AI response missing subject or body.' },
        { status: 502 },
      );
    }

    return NextResponse.json({ subject, body });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: 'AI service authentication failed. Check ANTHROPIC_API_KEY.' },
        { status: 500 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'AI service is rate-limited. Try again shortly.' },
        { status: 503 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: 'AI service error: ' + err.message },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: 'AI generation failed.' }, { status: 500 });
  }
}
