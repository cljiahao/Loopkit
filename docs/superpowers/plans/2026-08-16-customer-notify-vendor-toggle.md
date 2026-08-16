# Customer Notify Vendor Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vendor-level on/off toggle (default on) for the customer
redemption-confirmation Telegram message `redeemAction` sends via
`notifyCustomerByPhone`. No existing generic vendor-settings column was
found in this repo (verified: no `board_settings`/`vendor_settings`
anywhere in `src/`) — this adds a small dedicated table.

**Spec:** `docs/superpowers/specs/2026-08-16-customer-notify-vendor-toggle-design.md`

**Depends on:** `feat/customer-telegram-connect` (this repo, PR #79)
already merged — confirmed on `main`.

## Global Constraints

- Default must be `true` for a vendor with no `vendor_notify_settings`
  row at all (never visited the settings page) — resolve this in
  application code, not just via the column default.
- The toggle only ever affects whether `redeemAction` _calls_
  `notifyCustomerByPhone` — it must never touch merqo's consent/
  connection data.
- TypeScript strict, no `any`.
- Work on a feature branch, never commit directly to `main`.
- Run `pnpm check && pnpm test && pnpm build` before opening the PR.

---

### Task 0: Branch setup

```bash
git fetch origin main
git checkout -b feat/customer-notify-vendor-toggle origin/main
```

Confirm `pnpm test` passes on baseline, and that `redeemAction` already
calls `notifyCustomerByPhone` (i.e. the dependency PR has landed) before
proceeding.

---

### Task 1: Migration

**Files:** `supabase/migrations/00XX_vendor_notify_settings.sql` (next
free id at implementation time)

- [ ] Write the migration exactly as in the spec's "What changes"
      section (`loopkit.vendor_notify_settings`, RLS, own-row select
      policy, `authenticated` grant).
- [ ] Apply locally, regenerate `src/lib/types.ts`.
- [ ] Commit: `feat: add vendor_notify_settings table`.

### Task 2: Gate `redeemAction`

**Files:** `src/app/dashboard/actions.ts`,
`test/app/dashboard-actions.test.ts` (extend)

- [ ] Failing tests first: a vendor with `customer_telegram_notify_enabled: false`
      does NOT call `notifyCustomerByPhone`; a vendor with the flag
      `true`, or with no `vendor_notify_settings` row at all, still calls
      it.
- [ ] Implement: read the vendor's `vendor_notify_settings` row
      (authenticated client, RLS-scoped) before the existing
      `notifyCustomerByPhone` call, skip the call only when a row exists
      AND the flag is explicitly `false`.
- [ ] Commit: `feat: let a vendor disable the customer redemption notification`.

### Task 3: Settings action + UI

**Files:** new server action (e.g. `saveCustomerNotifySettingsAction` in
`src/app/dashboard/actions.ts` or a dedicated settings-actions file,
matching this repo's existing convention — check
`saveQkitEarnConfigAction`'s shape first), the actual settings page
component (find where the existing "Connect Telegram" section from Phase
A lives), + tests.

- [ ] Failing tests first: the action upserts
      `vendor_notify_settings.customer_telegram_notify_enabled`; the UI
      toggle renders, defaults checked (either from a `true` row or no
      row at all), and saving flips it.
- [ ] Implement the action (upsert on `vendor_id`, same shape as
      `saveQkitEarnConfigAction`) and the settings-page switch.
- [ ] Commit: `feat: add customer-notify toggle to dashboard settings`.

### Task 4: Docs

**Files:** `AGENTS.md`, `CHANGELOG.md`, any touched folder READMEs
(this repo's readme-freshness gate expects them updated in the same
commit)

- [ ] Update `AGENTS.md`'s data model section to document
      `vendor_notify_settings`.
- [ ] Add a `CHANGELOG.md` entry.

### Task 5: Verification gate

- [ ] `pnpm check && pnpm test && pnpm build`; extend
      `supabase/tests/rls.test.sql` if one exists for this repo's RLS
      coverage pattern.
- [ ] Push, PR, poll CI green (`gh pr checks <N> --watch` — block on it
      yourself, no monitor exists), squash-merge.

## Self-Review Notes

- Spec coverage: migration (Task 1), gate (Task 2), settings action + UI
  (Task 3), docs (Task 4), verification (Task 5).
- Default-true-when-no-row backward compat is explicitly tested in
  Task 2, not just claimed.
- This plan never touches merqo or the consent model — vendor-side gate
  only, same boundary as qkit's own equivalent fast-follow.
