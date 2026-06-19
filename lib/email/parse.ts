// Email format check. Permissive — RFC 5322 fully validating regex is famously
// huge and counterproductive. We require an "@" with non-space text on both
// sides, and at least one "." in the domain portion. Real validity is decided
// by whether the message bounces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParseResult {
  /** Emails that passed validation and were not duplicates of in-batch or existing. */
  added: string[];
  /** Number of tokens that were valid emails but duplicates (of each other or existing). */
  duplicates: number;
  /** Number of tokens that failed format validation. */
  invalid: number;
  /** The actual invalid tokens (for surfacing back to the user). */
  invalidEmails: string[];
}

/**
 * Parse a free-form string of pasted emails. Splits on commas, semicolons,
 * newlines, and whitespace; trims; lowercases; format-checks; dedupes the batch
 * against itself AND against an existing set (case-insensitive).
 *
 * @param input    Raw textarea content.
 * @param existing Set of already-known emails, lower-cased.
 */
export function parseEmails(
  input: string,
  existing: ReadonlySet<string> = new Set(),
): ParseResult {
  const tokens = input
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const added: string[] = [];
  const invalidEmails: string[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const token of tokens) {
    if (!EMAIL_RE.test(token)) {
      invalidEmails.push(token);
      continue;
    }
    if (existing.has(token) || seen.has(token)) {
      duplicates += 1;
      continue;
    }
    seen.add(token);
    added.push(token);
  }

  return {
    added,
    duplicates,
    invalid: invalidEmails.length,
    invalidEmails,
  };
}
