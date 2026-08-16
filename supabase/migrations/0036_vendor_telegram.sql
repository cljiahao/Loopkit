-- 0036 — Telegram reward-redemption alerts: a vendor links their Telegram
-- account once (deep-link QR), then redeemAction fires a message to their
-- linked chat on every reward redemption. Same shape as qkit's own
-- vendor_telegram/telegram_link_tokens spec (docs/superpowers/specs/
-- 2026-08-16-telegram-order-alerts-design.md in the qkit repo), substituting
-- the loopkit schema. See docs/superpowers/specs/2026-08-16-telegram-reward-
-- alerts-design.md.

create table loopkit.vendor_telegram (
  vendor_id  uuid primary key references auth.users(id) on delete cascade,
  chat_id    bigint not null,
  linked_at  timestamptz not null default now()
);

alter table loopkit.vendor_telegram enable row level security;

create policy vendor_telegram_own on loopkit.vendor_telegram
  for select using (vendor_id = (select auth.uid()));

-- Writes only via the service-role client (the webhook route and the
-- link-token-issuing settings action) — no INSERT/UPDATE/DELETE grant to
-- authenticated, same writer-restriction reasoning as loopkit.pricing (0034)
-- and paykit's vendor_payment_config.
grant select on loopkit.vendor_telegram to authenticated;
grant all on loopkit.vendor_telegram to service_role;

create table loopkit.telegram_link_tokens (
  token       text primary key,
  vendor_id   uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- RLS enabled, zero policies — service-role only, no client ever reads this
-- table (same "no client access at all" shape as loopkit.admin_audit's
-- read side, but here neither read nor write is exposed).
alter table loopkit.telegram_link_tokens enable row level security;

grant all on loopkit.telegram_link_tokens to service_role;
