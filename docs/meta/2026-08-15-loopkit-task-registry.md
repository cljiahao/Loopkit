# loopkit — Task Registry (2026-08-15)

loopkit's first standing backlog doc. Unlike qkit/paykit/merqo, loopkit had
no `docs/meta/` at all until now — domain code (programs/cards/stamps, auth,
dashboard, admin) shipped against `docs/superpowers/plans/2026-07-07-loopkit-
core.md` and later feature work was tracked only as further dated
specs/plans in `docs/superpowers/{specs,plans}/`, with no cross-cutting
backlog pulling deferred items together. This is that pull.

**No P1 items found.** loopkit's core loop (stamp/lucky/plant/chance
programs, customer scan-and-stamp, vendor dashboard) is implemented and
live — this isn't a "not yet wired up" situation like paykit's early
registry. What follows are real, evidenced gaps found by reading the actual
code, today's own PR history (`git log --oneline -30`), and the
`docs/superpowers/specs/` "Out of scope" sections — not invented backlog.

## P2 — real verification, not urgent yet

### T1. `applyVisit`/`getProgress` dispatcher: the wheel/scratch branch is never exercised through the dispatcher itself

`src/lib/engine/index.ts`'s `applyVisit` (lines 92–128) and `getProgress`
(lines 130–165) each switch on `program.type` and route to the matching
strategy. Every branch except `"wheel"`/`"scratch"` is covered by a test
that calls `applyVisit`/`getProgress` directly (not just the underlying
strategy): `test/lib/engine/apply-visit.test.ts` covers `"lucky"` and
`"stamp"`, `test/lib/engine/plant-apply-visit.test.ts` covers `"plant"`.
`test/lib/engine/chance.test.ts` (the wheel/scratch coverage) imports
straight from `@/lib/engine/chance` — it tests `makeChanceStrategy` itself,
never the dispatcher's routing to it. A typo'd case label in that one
branch (e.g. `"wheell"`) would silently fall through to the `"stamp"`
default and no test would catch it — a real gap against this repo's own
mutation-testing scope (`stryker.conf.json` mutates all of `src/lib/**/*.ts`,
`index.ts` included).

Fix is small and well-precedented: a `test/lib/engine/chance-apply-visit.test.ts`
mirroring `plant-apply-visit.test.ts`'s pattern, calling `applyVisit`/
`getProgress` with `type: "wheel"` and `type: "scratch"`.

## P3 — cosmetic / tech debt, no functional dependency

### T2. `setup/page.tsx` + `setup-form.tsx` cognitive-complexity lint suppressed, explicitly flagged as follow-up debt

`chore(lint): roll out sonarjs recommended rule set` (`#72`, `ae74fca`,
merged 2026-08-15 — today) turned on `eslint-plugin-sonarjs`'s full
recommended rule set and fixed 64 of 90 real findings across the repo, but
carved out `sonarjs/cognitive-complexity` + `sonarjs/no-nested-conditional`
for `src/app/setup/page.tsx` (complexity 95 vs. the 15 threshold, 327
lines) and `setup-form.tsx` (complexity 67, 990 lines) — the repo's two
largest, most complex files. The PR's own description is explicit: "the two
largest, most complex files in the repo... Decomposing them safely needs a
dedicated, tested refactor pass, not a rushed side effect of this rollout.
**Flagged as real follow-up debt, not silently suppressed.**" No
decomposition plan exists yet.

## P4 — future / structural, no current urgency or demand signal

### T3. `applyVisit`/`getProgress` run two parallel switch statements instead of the originally-planned `STRATEGIES` registry

`docs/superpowers/plans/2026-07-07-loopkit-v2-phase1-engine.md` (line 29)
planned `src/lib/engine/index.ts` as a `STRATEGIES` registry + a
`getProgress()` helper. What shipped is two independent switch statements
over `program.type` (`applyVisit` lines 92–128, `getProgress` lines
130–165), each hand-dispatching to the matching strategy's `.apply`/
`.progress`. Every strategy implements the shared generic `Strategy<C, S>`
interface (`src/lib/engine/types.ts`), but each program type has a distinct
Config/State pair (`StampConfig`/`StampState`, `LuckyConfig`/`LuckyState`,
etc.) — a single `Record<string, Strategy<C, S>>` map would need every
entry erased to `Strategy<unknown, unknown>`, and TypeScript has no way to
verify that a given branch's `resolveXConfig`/`resolveXState` result
actually matches the strategy pulled generically out of such a map, short
of an unsafe cast at the call site. That's a real, structural reason the
two-switch shape has persisted rather than an oversight. Low priority: the
only real risk is duplication drift (a new program type added to one switch
and not the other) — the two switches are in sync today and this is not a
functional bug.

### T4. Points Club multi-tier "reward-tier catalog + running balance" redemption — deferred twice, still no spec

`docs/superpowers/specs/2026-07-22-card-type-regroup-and-chance-revamp-design.md`'s
"Out of scope" section: "Points Club redemption redesign (running balance,
reward-tier catalog, new redeem flow) — separate follow-up spec." What
actually shipped (`docs/superpowers/specs/2026-07-15-points-club-design.md`)
is single-threshold accumulate-and-redeem — it reuses Stamp's exact
carryover/redeem semantics with a configurable `points_per_visit`, not a
multi-tier catalog with a running balance. No follow-up spec for the
multi-tier version has been written since (`docs/superpowers/` has no other
mention of "reward-tier catalog" or "running balance"). No demand signal
recorded either way — noted here only so the deferral isn't lost, same as
paykit's T5 regional-rails item.

## Open items carried forward, unresolved (not loopkit-owned)

- **Pro upgrade is a manual-review row, not real billing** — flagged in
  merqo hub's own `../merqo/docs/meta/2026-07-17-merqo-hub-task-registry.md`:
  "neither qkit nor loopkit's upgrade flow does anything beyond inserting a
  manual-review row." Deliberately deferred pending the founder's
  in-progress SG ACRA registration to attach Stripe (per that doc's
  2026-07-18 update). Tracked and owned in merqo's registry, not duplicated
  here as a loopkit task — noted so it isn't lost.

## Parent

[docs/meta](README.md)
