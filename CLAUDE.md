# CLAUDE.md — MailForge (bulk email platform)

> Drop this file in the root of a fresh repo as `CLAUDE.md`. It is the single
> source of truth for the build. Follow it top to bottom.

## Project identity

You are building **MailForge** — a simple, personal bulk-email platform for
sending marketing campaigns to roughly 100 recipients per day, with inbox
deliverability as the top priority. It is single-user today and architected so
multi-tenant resale can be layered on later without a rewrite.

The system does four things: compose emails, manage recipients, send campaigns,
and see results.

## Golden rule

**Simplicity above all.** Lean on the platform, not on custom code. Supabase
handles auth, the database, row-level security, and file storage. Resend handles
sending, domain authentication, and delivery/bounce/click tracking. We write the
*product* on top of those two services — not infrastructure they already provide.
If a feature needs more than a file or two, question whether it's needed. If a
library adds more complexity than it removes, skip it.

---

## Stack (locked)

| Layer | Technology | Notes |
|------|-----------|-------|
| Framework | Next.js (App Router) | Frontend + API route handlers in one app |
| Hosting | Vercel | Zero-ops deploy |
| Database + Auth + Storage | Supabase (Postgres, Auth, RLS, Storage) | Auth and isolation are config, not code |
| Email provider | Resend | Sending, DKIM/SPF, open/click tracking, webhooks, suppression |
| AI content | Claude API (Sonnet) | One route handler, used by the "Write with AI" button |
| Styling | Tailwind CSS | No component library |

**Explicitly NOT used:** no self-managed VPS, no Redis, no background worker, no
raw AWS SES/S3/SNS, no JWT code of our own, no GeoIP database, no hand-rolled
tracking pixel or link rewriter. Resend and Supabase replace all of that.

---

## What we are deliberately NOT building in v1

These are deferred, not forgotten. Keep the code modular so they slot in later.

- **Drag-and-drop visual editor (Unlayer)** — templates + an HTML/plain-text box cover v1.
- **DNS verification checker UI** — Resend's dashboard already shows domain status.
- **Full multi-tenancy / resale onboarding / billing** — schema is tenant-shaped, but v1 is single-user.
- **Scheduling, drip sequences, A/B testing, segmentation** — out of scope.
- **Transactional email** (password resets etc.) — Supabase Auth handles its own.

v1 **does** include: AI content generation, pre-built templates, and a simple
analytics view.

---

## Phase 0 — manual setup before any code (you do this in the browser)

Deliverability is decided here, not in code. Do not skip.

1. **Supabase project** — create it, note the project URL and anon + service-role keys.
2. **Resend account** — create it; add and verify your **sending domain**. Follow
   Resend's wizard to add the DNS records it gives you: **SPF, DKIM, and a custom
   MAIL FROM** (return-path) record so SPF/DKIM align for DMARC.
3. **DMARC** — add a DMARC TXT record starting at `p=none` (monitor), tighten later.
4. **Tracking** — leave Resend's open/click tracking ON in the domain settings.
5. **Resend webhook** — you'll point it at the deployed `/api/webhooks/resend`
   endpoint once the app is live (Step 8); note the webhook signing secret.
6. **Env vars** — fill `.env.local` (and Vercel project settings) from `.env.example`.
7. **Warmup expectation** — send low volume to engaged recipients for the first
   couple of weeks. Reputation is earned, not configured.

> Tell the user (Peter) which of these are done before you start coding. If the
> Resend domain isn't verified yet, you can still build everything; live sends
> just won't deliver until it is.

---

## Execution directives

**Think hard before writing code.** Plan the approach and reason through edge
cases first. Use extended thinking for the parts where mistakes cost the most:
the email send path (idempotency, batching), the unsubscribe token signing, and
the webhook ingestion.

**Build in vertical slices, golden path first.** Do not build every backend
endpoint and then every page. Get one thin end-to-end path working early
(Step 3) — register, add one contact, send one real email to yourself, see the
event land — then widen. Run that end-to-end path again after every later step.

**Use subagents only along truly independent seams.** Good split: the four
independent features in the polish step (AI / templates / analytics view /
settings). Bad split: entity-vs-service of the *same* feature — that just creates
integration friction. When in doubt, one feature = one focused unit of work.

**Be complete.** No TODOs, no placeholder methods, no "implement later" stubs.
Every file you create is production-ready for its step.

**Verify each step:** type-check and build (`npm run build`), run the focused
tests for what you just wrote, then exercise the new behaviour (curl the route or
click through the page) before moving on. Do not proceed past a failing build or
a broken golden path.

---

## Database — Supabase Postgres

Auth is handled by Supabase Auth (`auth.users`). We do **not** build registration,
login, password hashing, or JWTs. Every table below is owned by a user and
isolated with **Row Level Security** — that replaces all manual "scope by
tenant_id" logic.

Manage schema with Supabase **migrations** (versioned SQL files), not a single
hand-edited `schema.sql`. This keeps schema changes safe as the product grows.

```sql
-- Owner row holds sending configuration; keyed to the Supabase auth user.
create table tenants (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  reply_to_email text,
  from_name text,
  from_email text,
  physical_address text,        -- required in every email footer (law)
  daily_send_limit int default 100,
  suspended boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  name text,
  status text default 'active'
    check (status in ('active','unsubscribed','bounced','complained')),
  source text default 'manual'
    check (source in ('manual','import','paste','signup_form')),
  consent_at timestamptz,        -- nullable; set for signup_form now, full consent model added at resale
  created_at timestamptz default now(),
  unique (tenant_id, lower(email))   -- email dedup is case-insensitive
);

create table lists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table list_contacts (
  list_id uuid not null references lists(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  primary key (list_id, contact_id)
);

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  subject text not null,
  html_body text,
  plain_text_body text,
  reply_to text,
  from_name text,
  from_email text,
  status text default 'draft' check (status in ('draft','sending','sent')),
  list_id uuid references lists(id),
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- One row per recipient per delivery, updated as Resend reports progress.
create table events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  resend_email_id text,          -- Resend's id, used to match incoming webhooks
  type text not null check (type in
    ('queued','sent','delivered','opened','clicked','bounced','complained')),
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_events_campaign on events(campaign_id);
create index idx_events_resend on events(resend_email_id);
create index idx_contacts_tenant_status on contacts(tenant_id, status);
create index idx_campaigns_tenant on campaigns(tenant_id);
```

**RLS:** enable on every table. Policy on each: `tenant_id = auth.uid()` (and on
`tenants`, `id = auth.uid()`). `list_contacts` is scoped through its parent list.
Public endpoints (webhook, unsubscribe) run with the **service-role** key on the
server only — never expose that key to the browser.

---

## Project structure (Next.js App Router)

```
app/
  (auth)/login/page.tsx
  (auth)/register/page.tsx
  (app)/dashboard/page.tsx
  (app)/contacts/page.tsx
  (app)/lists/page.tsx
  (app)/campaigns/page.tsx
  (app)/campaigns/new/page.tsx
  (app)/campaigns/[id]/report/page.tsx
  (app)/templates/page.tsx
  (app)/settings/page.tsx
  unsubscribe/[token]/page.tsx          -- public human page (GET)
  api/
    contacts/route.ts                   -- list, create
    contacts/paste/route.ts             -- batch paste parser
    contacts/import/route.ts            -- CSV/Excel import
    lists/route.ts                      -- + lists/[id]/contacts
    campaigns/route.ts                  -- + campaigns/[id], [id]/send, [id]/stats
    templates/route.ts
    ai/generate/route.ts                -- Claude API
    files/upload/route.ts               -- Supabase Storage
    unsubscribe/route.ts                -- public one-click POST (RFC 8058)
    webhooks/resend/route.ts            -- public, signature-verified
lib/
  supabase/server.ts                    -- server client (cookies / service role)
  supabase/client.ts                    -- browser client
  resend.ts                             -- Resend client + send helpers
  email/render.ts                       -- personalize, inject footer + unsub, html->text
  email/tokens.ts                       -- HMAC sign/verify for unsubscribe tokens
  email/parse.ts                        -- paste-string -> {valid, invalid, duplicates}
  ai.ts                                 -- Claude content generation
components/
  Layout.tsx  StatsCard.tsx  ContactTable.tsx  CampaignCard.tsx
  PasteEmailsModal.tsx  ImportCSVModal.tsx  EmailEditorTabs.tsx
  TemplatePreviewCard.tsx  ConfirmDialog.tsx
templates/                              -- 5 static HTML email templates
```

---

## Key implementation details

**Auth** — Supabase Auth email/password via `@supabase/ssr`. Registration also
inserts the matching `tenants` row. Protect the `(app)` route group with a server
check that redirects to `/login` when there's no session. No custom JWT code.

**Paste parser (`lib/email/parse.ts`)** — split on commas, semicolons, newlines,
and whitespace; trim; lowercase; validate format; dedupe within the batch and
against existing contacts (case-insensitive). Return
`{ added, duplicates, invalid, invalidEmails: string[] }`.

**Sending flow (`api/campaigns/[id]/send`)** — at ~100/day no queue is needed:
1. Validate: has subject, has body, has a list, list has active contacts.
2. Check tenant not suspended and under `daily_send_limit`.
3. Load active contacts only (skip unsubscribed/bounced/complained).
4. **Idempotency:** skip any contact that already has a non-`queued` event for
   this campaign, so a retry never double-sends.
5. For each recipient, render the email: replace `{{name}}` / `{{email}}`,
   append the footer (unsubscribe link + physical address), and auto-generate the
   plain-text part from the HTML.
6. Send via **Resend's batch endpoint** (up to ~100 per call), setting per-message
   `headers`: both `List-Unsubscribe` (mailto + the signed HTTPS URL) and
   `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Resolve **reply-to** in
   this order: campaign `reply_to` → tenant `reply_to_email` → from address.
7. Record one `queued`/`sent` event per recipient, storing the returned
   `resend_email_id`. Set campaign `status='sent'`, `sent_at=now()`.
> Confirm exact batch payload and header field names against current Resend docs.

**Unsubscribe** — never use raw IDs in public URLs. `lib/email/tokens.ts` makes an
**HMAC-signed token** of `{contactId, campaignId}`.
- `POST /api/unsubscribe` (one-click, RFC 8058): verify token, set
  `status='unsubscribed'`, return 200. This is what Gmail/Yahoo call.
- `GET /unsubscribe/[token]`: human page that verifies the token and shows
  "You've been unsubscribed."

**Webhook (`api/webhooks/resend`)** — public, but **verify the Svix signature**
using the Resend webhook secret before doing anything. Map event types
(`email.delivered/opened/clicked/bounced/complained`) to rows in `events`, matched
by `resend_email_id`. On a hard bounce set the contact `bounced`; on a complaint
set `complained`. Then run the suspend check.

**Abuse / suspend check** — only evaluate rates **after a minimum of 50 sends for
the tenant** (so one stray complaint can't suspend the account). Then: bounce rate
> 5% or complaint rate > 0.1% → set `tenants.suspended = true`.

**File upload (`api/files/upload`)** — Supabase Storage bucket, UUID filename
(never the original), return the public URL. Used for inline images in email HTML.

**AI content (`api/ai/generate`)** — POST `{ prompt }` → Claude (Sonnet). System
prompt: *"You are an email-marketing copywriter. Given the description, return a
subject line and an HTML body."* Prefer a tool/structured-output call; if parsing
free text, parse defensively and fall back gracefully. Return `{ subject, body }`.
Rate-limit per user.

**Templates** — 5 static, CSS-inlined HTML files in `/templates`, served by
`api/templates`. (Inline CSS matters: Outlook ignores `<style>` blocks.)

**Analytics view** — campaign report shows sent / delivered / clicked / bounced /
complained from a single aggregated query over `events`. Show opens too, but label
them "approximate" — Apple Mail privacy inflates opens.

---

## Constraints and rules

- Do not add features beyond this document or extra tables/columns beyond the schema.
- No component library (no MUI/Ant) — Tailwind only.
- Isolation is enforced by **RLS**, not by hand-written `where tenant_id = ...`.
- Never ship the Supabase **service-role** key or any secret to the browser.
- Public endpoints (`/api/webhooks/resend`, `/api/unsubscribe`, `/unsubscribe/*`)
  take **signed tokens or verified signatures only** — never raw enumerable IDs.
- Every email includes: unsubscribe link + physical address in the footer, a
  plain-text part, and `List-Unsubscribe` + one-click `List-Unsubscribe-Post` headers.
- Email dedup is case-insensitive. All timestamps UTC. UUIDs from Postgres.

---

## Build order

> For each step: think first, write complete code, build, test the seam, re-run
> the golden path. Don't proceed past a failure.

1. **Scaffold** — Next.js + Tailwind + Supabase clients + Resend client + `.env.example`. First migration creates the schema and RLS policies.
2. **Auth** — Supabase email/password, register (also inserts `tenants` row), protected route group, login/logout. Verify a session loads the dashboard.
3. **Golden path (thin slice)** — paste one contact → create one list → create a plain-HTML campaign → send to *yourself* via Resend → ingest the webhook → see the event on the report. Prove end-to-end before widening.
4. **Contacts (full)** — single add, paste parser with live preview, CSV/Excel import, status filter, search, table.
5. **Lists (full)** — create, add/remove contacts, contact counts.
6. **Campaigns + editor** — subject/from/reply-to/list fields, HTML + plain-text tabs, template picker, "Write with AI" button. (No Unlayer.)
7. **Sending (hardened)** — batch send, personalization, footer + plain-text generation, signed `List-Unsubscribe` headers + one-click endpoint, idempotency, daily-limit + suspend guard.
8. **Webhooks + analytics** — signature-verified Resend webhook ingestion, events, campaign report, dashboard stat cards + a sends-over-time chart.
9. **Settings + polish** — sending config (from name/email, reply-to, physical address), unsubscribe page, templates page, empty/loading/error states. (Subagents OK here — independent.)

---

## Testing (lean, seam-focused — not exhaustive)

Test the things that are easy to get wrong and expensive to break:

- `lib/email/parse.ts` — comma/semicolon/newline/mixed delimiters, extra spaces, invalid addresses, in-batch duplicates, empty input, case-insensitive dedup.
- `lib/email/tokens.ts` — sign→verify round-trips; tampered token rejected.
- `lib/email/render.ts` — `{{name}}`/`{{email}}` replacement; footer + unsubscribe injected; HTML→text non-empty.
- Send path — idempotency: a second send skips already-sent recipients (mock Resend).
- Webhook — valid signature processed; bad signature rejected; bounce → contact `bounced`.
- Suspend check — under 50 sends never suspends; over thresholds afterward does.
- One render + interaction test per page (renders, key elements visible, form submits to a mocked API, empty state shows).

**Golden-path end-to-end** (run after Steps 3, 7, and 9): register → paste contacts
→ create list → create campaign → send to a test inbox → confirm the Resend
webhook updates the event → unsubscribe via the one-click endpoint → confirm the
contact flips to `unsubscribed`. Every check must pass before declaring done.

---

## Compliance note (personal v1)

v1 is personal sending, so the consent model is light: `contacts.source` plus a
nullable `consent_at` (populated for `signup_form` contacts). Every email already
carries an unsubscribe mechanism and a physical address, which is the legally
load-bearing part. **Before resale**, add `consent_method` + `consent_ip`, a data-
export/erasure flow, and per-tenant terms — that's a deliberate, separate phase.
