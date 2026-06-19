-- MailForge initial schema.
-- Auth is delegated entirely to Supabase Auth (auth.users). Every domain table
-- is owned by a single auth user via tenant_id and isolated with RLS policies
-- whose USING/WITH CHECK reduce to `tenant_id = auth.uid()`.

-- ---------------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------------

create table tenants (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  reply_to_email text,
  from_name text,
  from_email text,
  physical_address text,
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
    check (status in ('active', 'unsubscribed', 'bounced', 'complained')),
  source text default 'manual'
    check (source in ('manual', 'import', 'paste', 'signup_form')),
  consent_at timestamptz,
  created_at timestamptz default now()
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
  status text default 'draft' check (status in ('draft', 'sending', 'sent')),
  list_id uuid references lists(id),
  sent_at timestamptz,
  created_at timestamptz default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  resend_email_id text,
  type text not null check (type in
    ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained')),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------

create index idx_events_campaign on events (campaign_id);
create index idx_events_resend on events (resend_email_id);
create index idx_contacts_tenant_status on contacts (tenant_id, status);
create index idx_campaigns_tenant on campaigns (tenant_id);

-- Case-insensitive per-tenant email uniqueness. Lives as a unique index because
-- inline UNIQUE constraints cannot contain expressions like lower(email).
create unique index idx_contacts_unique_email on contacts (tenant_id, lower(email));

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------

alter table tenants       enable row level security;
alter table contacts      enable row level security;
alter table lists         enable row level security;
alter table list_contacts enable row level security;
alter table campaigns     enable row level security;
alter table events        enable row level security;

-- tenants: a user can only see and modify their own tenant row.
create policy "tenants are self" on tenants
  for all
  using  (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- contacts / lists / campaigns / events: scoped by tenant_id == auth.uid().
create policy "contacts by tenant" on contacts
  for all
  using  (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "lists by tenant" on lists
  for all
  using  (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

create policy "campaigns by tenant" on campaigns
  for all
  using  (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

-- events: written by server-side code (service role) on send + webhook ingest,
-- and read by the owning tenant for the report screens. Service role bypasses RLS.
create policy "events by tenant" on events
  for all
  using  (tenant_id = (select auth.uid()))
  with check (tenant_id = (select auth.uid()));

-- list_contacts has no tenant_id of its own — scope through the parent list.
create policy "list_contacts by parent list" on list_contacts
  for all
  using (
    exists (
      select 1 from lists
      where lists.id = list_contacts.list_id
        and lists.tenant_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from lists
      where lists.id = list_contacts.list_id
        and lists.tenant_id = (select auth.uid())
    )
  );
