-- 0034 — admin-editable pricing: a single-row config so the vendor plan
-- page can show a live price and admins can tune it without a deploy. id
-- is pinned to 1. Seeded at 499 (= $4.99/mo) — loopkit's first-ever live
-- price (see docs/superpowers/specs/2026-08-15-loopkit-admin-pricing-
-- design.md for why this seeds a real number, not 0).

create table loopkit.pricing (
  id            int primary key default 1 check (id = 1),
  monthly_cents int not null default 0,
  currency      text not null default 'SGD',
  updated_at    timestamptz not null default now()
);

insert into loopkit.pricing (id, monthly_cents) values (1, 499)
  on conflict (id) do nothing;

alter table loopkit.pricing enable row level security;

-- Prices aren't secret — anyone signed in may read (the plan page is
-- behind auth already; a public-read policy just keeps this simple and
-- leaks nothing). Writes go through the service-role setPricing action
-- only — no insert/update/delete policy.
create policy pricing_public_select on loopkit.pricing
  for select using (true);

-- Data-API grants (be explicit, matching 0003's admin_audit precedent).
grant select on loopkit.pricing to authenticated;
grant all on loopkit.pricing to service_role;
