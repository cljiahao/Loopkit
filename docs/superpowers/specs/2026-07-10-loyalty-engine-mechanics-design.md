# Loyalty engine mechanics: endowed progress + post-redemption next-goal

Date: 2026-07-10

## Problem

Deep research into loyalty-program retention psychology (104-agent adversarial
research pass, see conversation for full findings) surfaced two well-evidenced,
directly actionable gaps in loopkit's engine:

1. **Endowed Progress Effect** (Nunes & Drèze 2006, n=300 field study): a
   loyalty card pre-filled with 2 of 10 stamps (same 8 purchases required)
   hit 34% completion vs. 19% for a blank 8-stamp card — ~1.8x lift from a
   head start alone, independent of objective distance to the reward.
   loopkit gives every new card zero starting progress today.
2. **Goal Gradient Effect** (Kivetz, Urminsky & Zheng 2006, ~10,000 real
   purchases): purchase frequency accelerates ~20% approaching a reward,
   then slumps sharply right after redemption. loopkit already handles this
   correctly for Stamp mode (the vendor dashboard shows the fresh card
   immediately after redeeming) but not for Plant or Streak mode, which
   collapse to a blank lookup form after redemption — the exact churn
   window the research flags.

This is sub-project B1 of a larger loyalty-strategy brainstorm (stats page,
plan page revamp, and cross-page program tracking follow as B2-B4); scoped
separately since it's an engine-level change touching different code than
the page-level work.

## Out of scope

- Lucky Tap / Wheel / Scratch: these are pity-counter mechanics with no
  accumulating "goal" to seed (redeem is a no-op — reward is granted
  instantly per visit), so endowed progress doesn't apply. Their `.redeem()`
  no-op is unaffected by the post-redemption fix (nothing to fix — there is
  no redeem step to show a next-goal state after).
- Any change to the pity-ceiling/win-probability mechanics themselves.
- A Singapore gambling-law compliance review of Lucky Tap/Wheel/Scratch —
  flagged by the research as a real open question (UK law treats free-to-play
  chance mechanics with real-value prizes as potentially regulated "gaming"
  even with no stake required) but out of scope for this engineering work;
  a legal question, not a code change.

## A. Post-redemption next-goal (Plant + Streak)

**Current state** (confirmed via code exploration):
- Stamp: `RedeemButton`'s `onRedeemed` callback in `serve-customer.tsx`
  already calls `setResult({ mode: "stamp", ..., card: next })` with the
  fresh zeroed card — correct behavior already.
- Plant: `confirmRedeemPlant()` in `serve-customer.tsx` calls `setResult(null)`
  after a successful redeem, collapsing to the blank phone-lookup form.
- Streak: `confirmRedeemStreak()` does the same — `setResult(null)`.

**Fix**: `redeemPlantAction`/`redeemStreakAction` in
`src/app/dashboard/actions.ts` return fresh progress in the same shape
`recordVisitAction` already returns (`{rewardUnlocked, progress, reward_text,
phone}`) instead of a bare success/failure. `serve-customer.tsx`'s
`confirmRedeemPlant`/`confirmRedeemStreak` render that returned state
(mirroring the stamp-mode pattern) instead of calling `setResult(null)`.
The underlying pure engine functions (`plantStrategy.redeem()`,
`streakStrategy.redeem()`) already compute the correct "next goal" state —
this is purely a plumbing fix to actually display what they return.

No schema change, no new config, no vendor-facing setting.

## B. Endowed progress (vendor opt-in)

**New column**: `loopkit.programs.head_start boolean not null default false`
(new migration). Meaningful only for `stamp`/`plant`/`streak` program types.

**Setup UI**: `/setup`'s type-specific forms (stamp/plant/streak variants of
`SetupForm`) get a new checkbox — "Give new customers a head start" — with
copy explaining it gives new signups a small free start toward their first
reward. Off by default. Not shown for lucky/wheel/scratch forms.

**Enrollment seeding**: `enroll_card` (currently a pure zero-default insert)
needs to consult the program's `type` and `head_start` flag and, when true,
seed the new card's initial progress at ~20% of that type's completion
threshold (matching the research's 2-of-10 ratio) instead of zero:

| Type | Seed | Cap |
|---|---|---|
| stamp | `stamp_count = max(1, round(0.2 × stamps_required))` | never reach `stamps_required` (no free reward at signup) |
| plant | `growth` seeded to ~20% of the full bloom threshold (`stages[4].threshold`, i.e. the visits-to-bloom value); `last_visit_at = now()` | so it doesn't immediately decay/wilt |
| streak | `current_streak = 1`, `window_start = now()` | one period's head start |

This only applies to *new* enrollments going forward — no retroactive
seeding of existing cards.

## Testing

- `test/lib/engine/{stamp,plant,streak}.test.ts` — extend for the
  post-redemption fix (assert `.redeem()`'s returned state is correctly
  shaped for re-display) and for endowed-progress seed calculations if that
  logic lives in a pure TS helper rather than purely in SQL.
- `test/db/enroll-phone-guard-schema.test.ts` /
  `test/db/card-lifecycle-schema.test.ts` — precedent pattern (regex-match
  migration SQL text) for testing the `enroll_card` signature change.
- `test/app/dashboard-actions.test.ts` — extend for
  `redeemPlantAction`/`redeemStreakAction`'s new return shape.
- `test/app/check-status-action.test.ts` — regression check that endowed
  progress doesn't break the existing stamp_count-vs-state read path this
  file already pins down.
