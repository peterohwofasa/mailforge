import { describe, it, expect } from 'vitest';
import { filterRecipientsForSend, shouldSuspend } from './send';

describe('filterRecipientsForSend', () => {
  it('returns everyone when there are no events', () => {
    const recipients = [{ id: 'a' }, { id: 'b' }];
    expect(filterRecipientsForSend(recipients, [])).toEqual(recipients);
  });

  it('skips recipients with a sent event', () => {
    const recipients = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const events = [{ contact_id: 'a', type: 'sent' }];
    expect(filterRecipientsForSend(recipients, events)).toEqual([
      { id: 'b' },
      { id: 'c' },
    ]);
  });

  it('skips recipients with any non-queued event (bounced, delivered, etc.)', () => {
    const recipients = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const events = [
      { contact_id: 'a', type: 'delivered' },
      { contact_id: 'b', type: 'bounced' },
      { contact_id: 'c', type: 'complained' },
    ];
    expect(filterRecipientsForSend(recipients, events)).toEqual([{ id: 'd' }]);
  });

  it('keeps recipients whose only event is queued', () => {
    const recipients = [{ id: 'a' }, { id: 'b' }];
    const events = [{ contact_id: 'a', type: 'queued' }];
    expect(filterRecipientsForSend(recipients, events)).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
  });

  it('preserves the original recipient shape', () => {
    const recipients = [
      { id: 'a', email: 'a@x.com' },
      { id: 'b', email: 'b@x.com' },
    ];
    const events = [{ contact_id: 'a', type: 'sent' }];
    expect(filterRecipientsForSend(recipients, events)).toEqual([
      { id: 'b', email: 'b@x.com' },
    ]);
  });
});

describe('shouldSuspend', () => {
  it('never suspends below 50 total sends, even with all bounces', () => {
    expect(
      shouldSuspend({ totalSent: 49, bounced: 49, complained: 49 }),
    ).toBe(false);
  });

  it('does not suspend at clean rates', () => {
    expect(
      shouldSuspend({ totalSent: 1000, bounced: 10, complained: 0 }),
    ).toBe(false);
  });

  it('suspends when bounce rate exceeds 5% (at 50+ sends)', () => {
    expect(
      shouldSuspend({ totalSent: 100, bounced: 6, complained: 0 }),
    ).toBe(true);
  });

  it('does not suspend at exactly the 5% bounce threshold (strict greater-than)', () => {
    expect(
      shouldSuspend({ totalSent: 100, bounced: 5, complained: 0 }),
    ).toBe(false);
  });

  it('suspends when complaint rate exceeds 0.1% (at 50+ sends)', () => {
    expect(
      shouldSuspend({ totalSent: 1000, bounced: 0, complained: 2 }),
    ).toBe(true);
  });

  it('does not suspend at exactly the 0.1% complaint threshold (strict greater-than)', () => {
    expect(
      shouldSuspend({ totalSent: 1000, bounced: 0, complained: 1 }),
    ).toBe(false);
  });

  it('triggers on the boundary case of 50 sends', () => {
    expect(
      shouldSuspend({ totalSent: 50, bounced: 3, complained: 0 }),
    ).toBe(true);
  });
});
