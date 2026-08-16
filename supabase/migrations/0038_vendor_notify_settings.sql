-- 0038 — Customer notify vendor toggle: a vendor-level on/off switch for the
-- customer redemption-confirmation Telegram message redeemAction sends via
-- notifyCustomerByPhone (2026-08-16-customer-telegram-connect-design.md).
-- Default true (opt-out) — the customer already consented by connecting
-- Telegram via qkit; this only lets a vendor who finds it off-brand turn it
-- off. No existing generic vendor-settings JSONB column was found in this
-- repo (unlike qkit's board_settings), so this adds a small dedicated table
-- rather than repurpose vendor_telegram (dropped by 0037; even if it still
-- existed, that table was the vendor's own alert-bot link — a different
-- concern). See docs/superpowers/specs/
-- 2026-08-16-customer-notify-vendor-toggle-design.md.

create table loopkit.vendor_notify_settings (
  vendor_id                        uuid primary key references auth.users(id) on delete cascade,
  customer_telegram_notify_enabled boolean not null default true,
  updated_at                       timestamptz not null default now()
);

alter table loopkit.vendor_notify_settings enable row level security;

-- `for all` (not `for select`) plus the matching insert/update grants below:
-- unlike vendor_telegram/telegram_link_tokens (service-role-only writers),
-- this is the vendor's own preference — a vendor upserts their own row
-- directly under RLS from a server action's authenticated client, same
-- shape as qkit_earn_config (0019).
create policy vendor_notify_settings_own on loopkit.vendor_notify_settings
  for all using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));

grant select, insert, update on loopkit.vendor_notify_settings to authenticated;
