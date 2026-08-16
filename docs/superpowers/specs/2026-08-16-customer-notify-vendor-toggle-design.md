# Customer Notify Vendor Toggle — Design

**Date:** 2026-08-16
**Status:** Approved; plan to follow. Fast-follow on top of
`2026-08-16-customer-telegram-connect-design.md` — do not start until
that one has merged (it introduces the `notifyCustomerByPhone` call this
spec gates).

## Summary

`redeemAction`'s call to `notifyCustomerByPhone` currently fires
unconditionally whenever the redeeming customer's phone matches an
existing merqo Telegram connection. Adds a vendor-level on/off toggle —
same reasoning as qkit's own fast-follow
(`../../qkit/docs/superpowers/specs/2026-08-16-customer-notify-vendor-toggle-design.md`):
this is a vendor brand-preference switch, not a consent gate (the
customer already consented via merqo's own connect flow). **Default: on
(opt-out).**

## Guiding decisions

- **No existing generic vendor-settings JSONB column in loopkit** (unlike
  qkit's `board_settings`) — verify this against the actual schema before
  building; if one exists, reuse it exactly like qkit's spec does. If
  not, add a small dedicated table rather than repurpose
  `vendor_telegram` (that table is the vendor's _own_ alert-bot link — a
  semantically different, unrelated concern; a vendor might toggle
  customer notifications on/off with no Phase A bot link at all, or vice
  versa).
- **Default `true` when no row exists** — same backward-compat rule as
  qkit's spec: a vendor who never touched this setting must not go
  silently dark the moment this ships.

## What changes

### `supabase/migrations/00XX_customer_notify_settings.sql` (new — number

per the next free migration id at implementation time)

Only if no existing generic vendor-settings table is found (verify
first, per the guiding decision above):

```sql
create table loopkit.vendor_notify_settings (
  vendor_id                        uuid primary key references auth.users(id) on delete cascade,
  customer_telegram_notify_enabled boolean not null default true,
  updated_at                       timestamptz not null default now()
);

alter table loopkit.vendor_notify_settings enable row level security;

create policy vendor_notify_settings_own on loopkit.vendor_notify_settings
  for select using (vendor_id = (select auth.uid()));

grant select on loopkit.vendor_notify_settings to authenticated;
-- Writes only via a server action's authenticated client under RLS (a
-- vendor may update only their own row) — no broader write grant needed
-- since this is the vendor's own preference, not service-role-only data
-- like vendor_telegram/telegram_link_tokens.
```

A row absent entirely (vendor never visited the settings page) must
resolve to "enabled" in application code — don't rely solely on the
column default (a lookup that finds no row at all still means "on").

### `src/app/dashboard/actions.ts`

`redeemAction`: before calling `notifyCustomerByPhone`, look up the
vendor's `vendor_notify_settings` row (or the reused generic settings
column, whichever applies); skip the call only if a row exists AND
`customer_telegram_notify_enabled === false`. No row → still call it
(defaults to on).

### Settings UI

A new toggle in `/dashboard/settings` (find the actual settings page
file — same file as the existing "Connect Telegram"/disconnect section
this repo's Phase A work added), labeled for turning off customer reward
confirmations, default checked, saving via a new server action
(`saveCustomerNotifySettingsAction` or similar, mirroring
`saveQkitEarnConfigAction`'s upsert shape).

## Testing

- `redeemAction` test (extend): a vendor with the flag `false` does NOT
  call `notifyCustomerByPhone`; a vendor with the flag `true`, or no row
  at all, still calls it.
- New settings-action test: toggling off writes `false`; toggling on (or
  never touching it) leaves/creates a `true` row.
- Settings UI test: renders, defaults checked.

## Self-review

- No placeholders.
- Explicitly checks for a reusable generic settings column before adding
  a new table — doesn't assume qkit's `board_settings` shape exists here
  too.
- Doesn't touch merqo or the consent model — vendor-side gate only, same
  boundary as qkit's own fast-follow.

## Parent

[specs](README.md)
