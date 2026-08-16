# Telegram Reward Redemption Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A vendor connects Telegram once (deep-link QR); every reward
redemption fires a Telegram message to their linked chat. loopkit's half
of the cross-kit Telegram Phase A rollout.

**Spec:** `docs/superpowers/specs/2026-08-16-telegram-reward-alerts-design.md`

## Global Constraints

- A failed/missing Telegram link must never affect `redeemAction`'s own
  result.
- Webhook signature verification (`X-Telegram-Bot-Api-Secret-Token`) is
  mandatory.
- `loopkit.vendor_telegram`/`loopkit.telegram_link_tokens`: no client
  INSERT/UPDATE/DELETE grant.
- **Confirm `redeemAction` (not `redeemOldestVoucher`) is genuinely the
  live redemption path before wiring anything** — the spec found this via
  grep, re-verify at implementation time in case it's changed since.
- TypeScript strict, no `any`.
- Work on a feature branch, never commit directly to `main`.
- Run `pnpm check && pnpm test && pnpm build` before opening the PR.

---

### Task 0: Branch setup

```bash
git fetch origin main
git checkout -b feat/telegram-reward-alerts origin/main
```

Confirm `pnpm test` passes on baseline first.

---

### Task 1: Migration

**Files:** `supabase/migrations/0036_vendor_telegram.sql`

- [ ] Write the migration mirroring qkit's `vendor_telegram`/
      `telegram_link_tokens` shape exactly (see qkit's spec for the SQL),
      substituting the `loopkit` schema.
- [ ] Apply locally.
- [ ] Commit: `feat: add vendor_telegram and telegram_link_tokens tables`.

### Task 2: `src/lib/telegram.ts`

**Files:** `src/lib/telegram.ts`, `src/lib/telegram.test.ts`

- [ ] Failing tests first — identical assertions to qkit's own
      `telegram.test.ts`.
- [ ] Implement (identical to qkit's — this is intentionally the same
      small module, no shared package needed for something this size).
- [ ] Commit: `feat: add sendTelegramMessage and generateLinkToken helpers`.

### Task 3: Webhook route

**Files:** `src/app/api/telegram/webhook/route.ts`,
`src/app/api/telegram/webhook/route.test.ts`

- [ ] Failing tests first — identical assertions to qkit's own.
- [ ] Implement, confirm excluded from `src/proxy.ts`'s auth gate.
- [ ] Commit: `feat: add Telegram webhook route with signature verification`.

### Task 4: Dashboard settings section

**Files:** find loopkit's actual vendor-settings route first (check
`src/app/dashboard/settings/` or wherever it really lives — don't assume
qkit's exact path), extend with a "Connect Telegram" section + test.

- [ ] Failing tests first: disconnected state (QR + link), connected
      state + disconnect.
- [ ] Server action: generate token, insert `telegram_link_tokens`,
      return the deep-link URL.
- [ ] Commit: `feat: add Connect Telegram section to dashboard settings`.

### Task 5: Wire the alert into `redeemAction`

**Files:** `src/app/dashboard/actions.ts`, its existing test file

- [ ] **First, confirm `redeemAction` (calling RPC `"redeem"`) is the
      live redemption path** — grep for callers of `redeem-button.tsx`'s
      action prop to be certain, per the spec's own caveat.
- [ ] Failing tests first: a vendor with a linked `chat_id` triggers
      `sendTelegramMessage` after a successful redeem (using the
      already-returned `card.phone`/`card.stamp_count`); a vendor without
      a link skips it silently; a send failure doesn't change
      `redeemAction`'s own returned result.
- [ ] Implement: after the existing successful-RPC branch, service-role
      lookup of `vendor_telegram` for `auth.uid()`; if found,
      `sendTelegramMessage(chat_id, ...)` wrapped in try/catch.
- [ ] Commit: `feat: send a Telegram alert on reward redemption when the vendor is linked`.

### Task 6: `.env.example` + docs

**Files:** `.env.example`, `AGENTS.md`, `src/lib/README.md`, dashboard
settings README, `CHANGELOG.md`

- [ ] Add `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`, same as qkit's
      Task 6. Note the manual one-time `setWebhook` deploy step.
- [ ] Update AGENTS.md, `lib/README.md`, `CHANGELOG.md`.

### Task 7: Verification gate

- [ ] `pnpm check && pnpm test && pnpm build`; extend
      `supabase/tests/rls.test.sql` with `vendor_telegram`/
      `telegram_link_tokens` RLS coverage.
- [ ] Push, PR, poll CI green, squash-merge.

## Self-Review Notes

- Spec coverage: migration (1), helpers (2), webhook (3), settings UI (4),
  redemption-alert wiring (5), docs/env (6), verification (7).
- Task 5 explicitly re-verifies the trigger-point assumption before
  wiring anything, per the spec's own caveat about `redeemOldestVoucher`
  appearing unused.
- No task lets a Telegram failure affect redemption itself — tested, not
  just claimed.
