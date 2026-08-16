# Vendor Telegram Connect (Phase A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire loopkit's own Telegram bot (Phase A) and route reward-
redemption vendor alerts through merqo's shared bot instead (Phase A2).

**Spec:** `docs/superpowers/specs/2026-08-16-vendor-telegram-connect-design.md`

**Depends on:** merqo's `docs/superpowers/plans/2026-08-16-vendor-telegram-connect.md`
shipped and deployed first — `POST /api/merqo/notify-vendor` must exist
(unit tests here can mock the HTTP layer ahead of that; the deletion
tasks below don't depend on it at all).

## Global Constraints

- This plan deletes real, currently-shipped code. Every deleted source
  file's own test file is deleted alongside it.
- `redeemAction`'s existing `notifyCustomerByPhone` call (separate,
  already-shipped, customer-facing) must not be touched or re-tested
  differently by this plan — only the vendor-alert call next to it
  changes.
- TypeScript strict, no `any`.
- Work on a feature branch, never commit directly to `main`.
- Run `pnpm check && pnpm test && pnpm build` before opening the PR.

---

### Task 0: Branch setup

```bash
git fetch origin main
git checkout -b feat/vendor-telegram-connect origin/main
```

Confirm `pnpm test` passes on baseline first.

---

### Task 1: Add `notifyVendor` to the existing merqo client

**Files:** `src/lib/merqo-customer-notify.ts`,
`src/lib/merqo-customer-notify.test.ts` (extend)

- [ ] Failing tests first: `notifyVendor(vendorId, message)` posts
      `{ vendor_id, message }` with the `MERQO_CUSTOMER_SECRET` bearer
      header to `${MERQO_BASE_URL}/api/merqo/notify-vendor`; never throws
      on non-2xx/timeout/network error.
- [ ] Implement as a sibling export next to the existing
      `notifyCustomerByPhone`.
- [ ] Commit: `feat: add notifyVendor merqo HTTP client helper`.

### Task 2: Rewire `redeemAction`'s vendor alert

**Files:** `src/app/dashboard/actions.ts`,
`test/app/dashboard-actions.test.ts` (rewrite the existing Telegram
vendor-alert test block)

- [ ] Failing tests first: `redeemAction` on a successful redeem calls
      `notifyVendor` with the vendor's own id and a redemption message; a
      `notifyVendor` failure doesn't change `redeemAction`'s own returned
      result. The existing `notifyCustomerByPhone` test block is
      untouched.
- [ ] Implement: replace `notifyRedemptionOnTelegram`'s body — swap the
      local `vendor_telegram` read + `sendTelegramMessage` call for
      `notifyVendor`.
- [ ] Commit: `feat: route redemption vendor alerts through merqo instead of loopkit's own bot`.

### Task 3: Delete Phase A's bot infrastructure

**Files (delete):**

- `src/app/api/telegram/webhook/route.ts` + its test
- `src/lib/telegram.ts` + its test
- `src/lib/telegram-link.ts` + its test
- `src/app/dashboard/settings/connect-telegram-section.tsx` + its test,
  and its render call in `src/app/dashboard/settings/page.tsx`
- `disconnectTelegramAction` in `src/app/dashboard/actions.ts` (+ its
  test coverage)

**Migration:** `supabase/migrations/00XX_drop_vendor_telegram.sql` (next
free id) — drops `loopkit.telegram_link_tokens`/`loopkit.vendor_telegram`
per the spec.

- [ ] Confirm `pnpm test` still passes after every deletion.
- [ ] Apply the migration locally, regenerate `src/lib/types.ts`.
- [ ] Commit: `feat: retire loopkit's own Telegram bot in favor of merqo's shared one`.

### Task 4: `.env.example` + docs

**Files:** `.env.example`, `AGENTS.md`, `CHANGELOG.md`, any touched
folder READMEs (this repo's readme-freshness gate)

- [ ] Remove `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` from
      `.env.example`.
- [ ] Update `AGENTS.md`'s Project-Specific Notes to remove the retired
      Phase A description and document `notifyVendor` calling merqo
      instead — name the Phase A → A2 supersession explicitly.
- [ ] Add a `CHANGELOG.md` entry stating the retirement and the
      reconnect-required consequence for any vendor who'd linked
      loopkit's own bot.

### Task 5: Verification gate

- [ ] `pnpm check && pnpm test && pnpm build`; remove the dropped
      tables' RLS assertions from `supabase/tests/rls.test.sql` if this
      repo has that suite wired the same way qkit's does — verify first.
- [ ] Push, PR, poll CI green (`gh pr checks <N> --watch` — block on it
      yourself, no monitor exists), squash-merge.

## Self-Review Notes

- Spec coverage: helper (Task 1), `redeemAction` rewiring (Task 2),
  deletion (Task 3), docs/env (Task 4), verification (Task 5).
- Task 3 is a real deletion pass — no dead code left behind, matching
  this project's clean-codebase standard.
- No task lets a merqo-side failure affect `redeemAction`'s result, and
  the existing customer-facing `notifyCustomerByPhone` path is left
  completely alone.
