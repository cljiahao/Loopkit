# Customer Telegram Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `redeemAction` checks whether the redeeming customer's phone
matches an existing `merqo.customers` Telegram connection (from having
connected via qkit) and, if so, sends a redemption confirmation too.
Reuse-only — no new UI, no new table, no connect flow.

**Spec:** `docs/superpowers/specs/2026-08-16-customer-telegram-connect-design.md`

**Depends on:** merqo's `docs/superpowers/plans/2026-08-16-customer-
telegram-connect.md` shipped and deployed first — specifically its
`notify-customer` endpoint's `phone` lookup mode. Unit tests here can
mock the HTTP layer ahead of that; live verification cannot.

## Global Constraints

- `notifyCustomerByPhone` must never throw, and a failure must never
  change `redeemAction`'s own returned result — same rule already proven
  for `notifyRedemptionOnTelegram` (Phase A).
- Only `phone` mode is used here — never mint a connect token, never
  reference `notify_ref` (loopkit has no "waiting" moment to attach a
  connect button to).
- The stated cross-kit limitation (a customer only matches here if they
  connected via qkit *with* a phone number) is not something to work
  around in this plan — it's the correct, expected behavior.
- TypeScript strict, no `any`.
- Work on a feature branch, never commit directly to `main`.
- Run `pnpm check && pnpm test && pnpm build` before opening the PR.

---

### Task 0: Branch setup

```bash
git fetch origin main
git checkout -b feat/customer-telegram-connect origin/main
```

Confirm `pnpm test` passes on baseline first.

---

### Task 1: `src/lib/merqo-customer-notify.ts`

**Files:** `src/lib/merqo-customer-notify.ts`,
`src/lib/merqo-customer-notify.test.ts`

- [ ] Failing tests first: `notifyCustomerByPhone` posts
      `{ vendor_id, phone, message }` (no `notify_ref`) with the
      `MERQO_CUSTOMER_SECRET` bearer header to
      `${MERQO_BASE_URL}/api/merqo/notify-customer`; never throws on
      non-2xx, timeout, or network error (catches + logs).
- [ ] Implement per the spec.
- [ ] Commit: `feat: add notifyCustomerByPhone merqo HTTP client helper`.

### Task 2: Wire into `redeemAction`

**Files:** `src/app/dashboard/actions.ts`, its existing test file

- [ ] Failing tests first: a successful redeem calls
      `notifyCustomerByPhone(user.id, card.phone, message)`; a
      `notifyCustomerByPhone` rejection doesn't change `redeemAction`'s
      own returned result — same assertion shape already used for
      `notifyRedemptionOnTelegram`'s own failure case.
- [ ] Implement: add the call as a sibling to the existing
      `await notifyRedemptionOnTelegram(user.id, ...)` line, same
      placement (after `revalidatePath`, before the return).
- [ ] Commit: `feat: send a redemption confirmation to a connected customer via merqo`.

### Task 3: `.env.example` + docs

**Files:** `.env.example`, `AGENTS.md`, `src/lib/README.md`,
`CHANGELOG.md`

- [ ] Add `MERQO_BASE_URL` and `MERQO_CUSTOMER_SECRET` to `.env.example`
      (must match the value merqo's own env records for this kit).
- [ ] Update `AGENTS.md`'s Project-Specific Notes to document this call
      and the stated phone-match-only limitation (don't oversell it as
      universal cross-kit reuse).
- [ ] Add a `CHANGELOG.md` entry.

### Task 4: Verification gate

- [ ] `pnpm check && pnpm test && pnpm build`.
- [ ] Push, PR, poll CI green, squash-merge.

## Self-Review Notes

- Spec coverage: HTTP client helper (Task 1), `redeemAction` wiring
  (Task 2), docs/env (Task 3), verification (Task 4).
- Task 2's tests prove (not just claim) that a merqo-side failure never
  affects `redeemAction`'s result.
- This plan is deliberately smaller than qkit's/merqo's own — reuse-only,
  no UI, no new table — matching the spec's own scope boundary.
