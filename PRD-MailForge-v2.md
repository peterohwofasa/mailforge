# Product requirements document — MailForge (bulk email platform)

**Version:** 2.0 · June 2026 · *Supersedes v1.0 (Java/Spring/SES)*

---

## 1. Product overview

A simple, low-maintenance web application for sending marketing email campaigns
that reliably land in inboxes. Built for personal use first, architected so
multi-tenant resale can be added later without a rewrite.

The system does four things: compose emails, manage recipients, send campaigns,
and see results. It leans on managed services (Supabase, Resend) so there is no
server to run, no queue to operate, and no tracking infrastructure to maintain.

---

## 2. Problem statement

Existing platforms (Mailchimp, Brevo) get expensive and complex for simple
campaign needs. Building from scratch on raw infrastructure (a self-managed
server, a job queue, hand-rolled tracking) is overkill for ~100 emails/day. This
product is the lightweight middle path: a small custom app on top of two managed
services that already solve the hard parts — authentication, the database, file
storage, sending, domain authentication, and delivery tracking.

---

## 3. Target users

- **Primary (v1):** the owner — sending marketing campaigns to up to ~100 recipients/day.
- **Secondary (v2+, deferred):** small businesses and marketers, each operating as a tenant.

---

## 4. Core requirements

### 4.1 Campaign management

| Requirement | Detail |
|------------|--------|
| Create campaign | Subject, email body, from name, from email, reply-to |
| Content input modes | Two in v1: (1) paste/write raw HTML, (2) plain text. (Visual drag-and-drop editor deferred.) |
| AI content generation | A "Write with AI" button: a short prompt generates a subject line + HTML body via the Claude API |
| Inline images | Upload → Supabase Storage → referenced as hosted URLs in the email HTML |
| File attachments | Upload → Supabase Storage → styled download link inserted in the body (not a raw attachment) |
| Pre-built templates | 5 professionally designed, CSS-inlined templates the user can select and customize |
| Reply-To header | Configurable per campaign; replies go to the sender's own inbox. Fallback order: campaign `reply_to` → account `reply_to_email` → from address (so a monitored from inbox is recommended) |
| Campaign status | Draft → Sending → Sent |
| Send action | Immediate — emails dispatched via the provider's batch API when the user hits send |

### 4.2 Contact management

| Requirement | Detail |
|------------|--------|
| Add single contact | Manual entry: email + name |
| Paste batch | Textarea accepting many emails, parsed from comma / newline / semicolon / whitespace input. Trimmed, lowercased, format-validated, and deduplicated (case-insensitive) |
| CSV/Excel import | Upload file, map columns, import contacts |
| Opt-in signup form | Embeddable HTML form that POSTs to the API, adding contacts with `source=signup_form` and a `consent_at` timestamp |
| Contact status | active, unsubscribed, bounced, complained — auto-updated from provider webhooks |
| Contact source tracking | Records how each contact was added: manual, import, paste, signup_form |

### 4.3 List management

| Requirement | Detail |
|------------|--------|
| Create lists | Named groups of contacts |
| Assign contacts | Add/remove contacts to/from lists |
| Campaign targeting | Each campaign sends to one list |

### 4.4 Email sending

| Requirement | Detail |
|------------|--------|
| Sending provider | **Resend** (handles DKIM/SPF, sending, and delivery/open/click tracking) |
| Throughput | Resend batch send (up to ~100 messages/call); no custom queue or worker at this volume |
| Idempotency | A recipient already sent for a campaign is skipped on retry — never double-sent |
| Personalization | Replace `{{name}}` and `{{email}}` tokens with contact data |
| Plain-text version | Auto-generated from the HTML body, included with every email |
| Unsubscribe link | Injected into every email footer as a signed, non-enumerable URL |
| List-Unsubscribe headers | `List-Unsubscribe` (mailto + HTTPS) **and** one-click `List-Unsubscribe-Post` (RFC 8058) on every send |
| Physical address | Included in every email footer (legally required) |
| Daily cap | Per-account `daily_send_limit` enforced before send |

### 4.5 Tracking and analytics

| Requirement | Detail |
|------------|--------|
| Delivery / bounce / complaint | Resend webhook → verified by signature → recorded as events; contact status auto-updated |
| Open tracking | Provided by Resend; surfaced but labelled **approximate** (Apple Mail privacy inflates opens) |
| Click tracking | Provided by Resend via webhook events |
| Campaign report | Per-campaign dashboard: sent, delivered, opened, clicked, bounced, complained — counts and percentages from a single aggregated query |
| Dashboard | Account-level stat cards + a sends-over-time chart |

> Removed from v1 because the provider supplies them: the 1×1 tracking pixel,
> link-rewriting, SNS signature plumbing, GeoIP/country lookup, and User-Agent
> device parsing.

### 4.6 Abuse prevention

| Requirement | Detail |
|------------|--------|
| Bounce rate monitor | Auto-suspend if bounce rate exceeds 5% — **only after ≥50 sends** |
| Complaint rate monitor | Auto-suspend if complaint rate exceeds 0.1% — **only after ≥50 sends** |
| Rate limiting | Per-account daily sending cap; per-user limit on the AI endpoint |
| Audit trail | Each campaign stores its content, target list, timestamps, and sender identity |

> The minimum-volume floor prevents a single stray complaint at low volume from
> instantly suspending the account.

### 4.7 Multi-tenancy (architected, deferred)

| Requirement | Detail |
|------------|--------|
| Isolation | Enforced by Supabase **Row Level Security** (`tenant_id = auth.uid()`) on every table — present from day one |
| Sending identity | v1 sends from the owner's verified Resend domain |
| Onboarding / per-tenant domains / billing | Deferred to the resale phase |

### 4.8 Authentication

| Requirement | Detail |
|------------|--------|
| Provider | **Supabase Auth** (email + password) — no custom JWT/session code |
| Sessions | Managed by Supabase via `@supabase/ssr` cookies; route group protected by a server session check |

---

## 5. Technical architecture

### 5.1 Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) — frontend + API route handlers |
| Hosting | Vercel |
| Database / Auth / Storage | Supabase (Postgres + RLS, Auth, Storage) |
| Email provider | Resend |
| AI content | Claude API (Sonnet) |
| Styling | Tailwind CSS (no component library) |

**Not used:** self-managed VPS, Redis, background worker, raw AWS SES/S3/SNS,
custom JWT code, GeoIP database, hand-rolled tracking pixel/link rewriter.

### 5.2 Database schema

Six tables, RLS on all. Auth users live in Supabase's `auth.users`; `tenants`
holds sending configuration keyed to the auth user.

- **tenants** — id (uuid PK = auth.users.id), name, reply_to_email, from_name, from_email, physical_address, daily_send_limit, suspended, created_at, updated_at
- **contacts** — id (uuid PK), tenant_id (FK), email, name, status (active/unsubscribed/bounced/complained), source (manual/import/paste/signup_form), consent_at (nullable), created_at, **unique(tenant_id, lower(email))**
- **lists** — id (uuid PK), tenant_id (FK), name, created_at
- **list_contacts** — list_id (FK), contact_id (FK), composite PK
- **campaigns** — id (uuid PK), tenant_id (FK), subject, html_body, plain_text_body, reply_to, from_name, from_email, status (draft/sending/sent), list_id (FK), sent_at, created_at
- **events** — id (uuid PK), tenant_id (FK), campaign_id (FK), contact_id (FK), resend_email_id, type (queued/sent/delivered/opened/clicked/bounced/complained), metadata (jsonb), created_at

Schema is managed with versioned **Supabase migrations**, not a single hand-edited
file.

### 5.3 API routes (Next.js route handlers)

- Contacts: `GET/POST /api/contacts`, `POST /api/contacts/paste`, `POST /api/contacts/import`, `DELETE /api/contacts/[id]`
- Lists: `GET/POST /api/lists`, `POST /api/lists/[id]/contacts`, `DELETE /api/lists/[id]`
- Campaigns: `GET/POST /api/campaigns`, `PUT /api/campaigns/[id]`, `POST /api/campaigns/[id]/send`, `GET /api/campaigns/[id]/stats`
- Templates: `GET /api/templates`
- AI: `POST /api/ai/generate`
- Files: `POST /api/files/upload` (Supabase Storage)
- Unsubscribe (public): `POST /api/unsubscribe` (one-click, signed token), `GET /unsubscribe/[token]` (human page)
- Webhook (public, signature-verified): `POST /api/webhooks/resend`

Auth (register/login/logout) is handled by Supabase Auth, not custom endpoints.
All public endpoints accept signed tokens or verified signatures only — never raw
enumerable IDs.

### 5.4 Frontend pages

Ten routes: `/login`, `/register`, `/dashboard`, `/contacts`, `/lists`,
`/campaigns`, `/campaigns/new`, `/campaigns/[id]/report`, `/templates`,
`/settings`. Plus a public `/unsubscribe/[token]` page.

---

## 6. Legal and compliance

- Unsubscribe mechanism in every email (one-click + link) — legally required.
- Physical address in every email footer — legally required.
- POPIA (South Africa), CAN-SPAM (USA), GDPR (EU), CASL (Canada) awareness.
- **v1 consent model (light):** `contacts.source` + a nullable `consent_at`
  (populated for `signup_form` contacts). v1 is personal sending to lists the
  owner controls.
- **Before resale (deferred):** add `consent_method` + `consent_ip`, a data
  export/erasure flow, per-tenant terms of service and acceptable-use policy, and
  a data-processing agreement.

---

## 7. Success metrics

| Metric | Target |
|--------|--------|
| Email delivery rate | > 98% |
| Bounce rate | < 2% |
| Complaint rate | < 0.1% |
| Click rate (primary engagement signal) | tracked per campaign |
| Open rate | tracked but treated as **approximate** (privacy features inflate it) |
| Cost | ~$0 at this volume (free tiers of Supabase, Vercel, Resend; Claude API pay-per-use) |

---

## 8. Build phases

**Phase 0 (manual, in the browser):** create Supabase project; create Resend
account and verify the sending domain (SPF, DKIM, custom MAIL FROM, DMARC at
`p=none`); set env vars; note the webhook signing secret.

**Phase 1 — foundation:** scaffold Next.js + Tailwind + Supabase + Resend
clients; first migration with schema + RLS; Supabase Auth (register inserts the
tenant row); protected routes.

**Phase 2 — golden path:** thin end-to-end slice — paste a contact → create a
list → create a plain-HTML campaign → send to yourself via Resend → ingest the
webhook → see the event on the report.

**Phase 3 — widen:** full contacts (paste/CSV/import/search/filter), full lists,
campaign editor (HTML + plain text, templates, "Write with AI").

**Phase 4 — sending hardened + analytics:** batch send, personalization, footer +
plain-text generation, signed `List-Unsubscribe` headers and one-click endpoint,
idempotency, daily-limit + suspend guard, webhook ingestion, campaign report,
dashboard.

**Phase 5 — polish:** settings (sending config), unsubscribe page, templates
page, empty/loading/error states, deploy to Vercel.

**Later (when needed):** drag-and-drop editor, DNS checker UI, multi-tenant
onboarding, per-tenant domains, billing (Stripe).

---

## 9. Out of scope (v1)

- Drag-and-drop visual editor (Unlayer) — deferred.
- DNS verification checker UI — Resend's dashboard covers it.
- Transactional emails (password resets, order confirmations).
- Drip campaigns / sequences / scheduling.
- A/B testing.
- SMS or WhatsApp messaging.
- Mobile app.
- Advanced segmentation or conditional logic.
- Multi-tenant onboarding and billing.

---

## 10. Dependencies

- **Supabase** project (Postgres + Auth + RLS + Storage).
- **Resend** account + a verified sending domain with DNS access (SPF, DKIM, MAIL FROM, DMARC).
- **Vercel** account for hosting.
- **Claude API** key (AI content generation).
- A custom domain (sending) and a deployment URL (Vercel default is fine for v1).

> Dropped from v1.0: AWS (SES/S3/SNS/CloudFront), MaxMind GeoLite2, a self-managed
> VPS, and the Unlayer account (deferred).
