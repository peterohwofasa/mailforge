import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Idempotency filter
// ---------------------------------------------------------------------------

interface RecipientLike {
  id: string;
}

interface EventLike {
  contact_id: string;
  type: string;
}

/**
 * Drop recipients that already have any non-`queued` event for the campaign.
 * The thinking: 'queued' is a pre-send marker; anything else (sent / delivered
 * / bounced / complained / opened / clicked) means we already handed the email
 * to Resend for that recipient — re-sending would double-deliver.
 */
export function filterRecipientsForSend<R extends RecipientLike>(
  recipients: R[],
  existingEvents: EventLike[],
): R[] {
  const alreadyProcessed = new Set(
    existingEvents.filter((e) => e.type !== 'queued').map((e) => e.contact_id),
  );
  return recipients.filter((r) => !alreadyProcessed.has(r.id));
}

// ---------------------------------------------------------------------------
// Suspend guard
// ---------------------------------------------------------------------------

interface SuspendStats {
  totalSent: number;
  bounced: number;
  complained: number;
}

const SUSPEND_MIN_SENDS = 50;
const SUSPEND_BOUNCE_RATE = 0.05; // 5%
const SUSPEND_COMPLAINT_RATE = 0.001; // 0.1%

/**
 * Decide whether a tenant should be suspended based on event counts. Pure
 * function so the threshold logic is unit-testable.
 *
 * Don't evaluate at all until at least 50 sends — one stray bounce on a small
 * volume would otherwise suspend the account on the first send.
 */
export function shouldSuspend(stats: SuspendStats): boolean {
  if (stats.totalSent < SUSPEND_MIN_SENDS) return false;
  const bounceRate = stats.bounced / stats.totalSent;
  const complaintRate = stats.complained / stats.totalSent;
  return bounceRate > SUSPEND_BOUNCE_RATE || complaintRate > SUSPEND_COMPLAINT_RATE;
}

/**
 * Pulls live event counts via service-role and applies the suspend flag.
 * Idempotent — safe to invoke after every send batch and from the webhook.
 * Returns true if this call resulted in (or confirmed) the suspended state.
 */
export async function evaluateSuspendCheck(
  tenantId: string,
): Promise<boolean> {
  const admin = createAdminClient();

  const [total, bounced, complained] = await Promise.all([
    admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('type', 'sent'),
    admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('type', 'bounced'),
    admin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('type', 'complained'),
  ]);

  const stats: SuspendStats = {
    totalSent: total.count ?? 0,
    bounced: bounced.count ?? 0,
    complained: complained.count ?? 0,
  };

  if (!shouldSuspend(stats)) return false;

  await admin.from('tenants').update({ suspended: true }).eq('id', tenantId);
  return true;
}
