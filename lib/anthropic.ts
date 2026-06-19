import Anthropic from '@anthropic-ai/sdk';

// Sonnet 4.6 — latest Claude Sonnet at time of writing. The "Write with AI"
// flow doesn't need Opus and Haiku doesn't follow long-form copy directions
// as reliably.
export const CLAUDE_MODEL = 'claude-sonnet-4-6' as const;

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});
