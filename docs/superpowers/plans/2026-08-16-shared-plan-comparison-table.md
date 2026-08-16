# Shared Plan Comparison Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate loopkit's `/dashboard/plan` page's feature-comparison
grid onto the shared `@merqo/ui` `PlanComparisonTable` component (already
built by qkit's own plan).

**Spec:** `docs/superpowers/specs/2026-08-16-shared-plan-comparison-table-design.md`

**Depends on:** qkit's `docs/superpowers/plans/2026-08-16-shared-plan-comparison-table.md`
Task 1 (the `merqo-ui` component build + tag) already merged and tagged —
confirm the tag exists before starting.

## Global Constraints

- The migrated page's visible output must be pixel-equivalent to what it
  replaces — refactor, not redesign.
- TypeScript strict, no `any`.
- Work on a feature branch, never commit directly to `main`.
- Run `pnpm check && pnpm test && pnpm build` before opening the PR.

---

### Task 0: Branch setup

```bash
git fetch origin main
git checkout -b feat/plan-comparison-table origin/main
```

Confirm `pnpm test` passes on baseline first.

---

### Task 1: Bump `@merqo/ui` and migrate the plan page

**Files:** `package.json`, `src/app/dashboard/plan/page.tsx`, its
existing test

- [ ] Bump `@merqo/ui` to the tag qkit's plan produced, `pnpm install`,
      confirm `node_modules/@merqo/ui/dist/index.js` actually exports
      `PlanComparisonTable`.
- [ ] Failing tests first (re-target any existing comparison-grid test
      assertions at `PlanComparisonTable`'s rendered output).
- [ ] Replace the local `FEATURES`-rendering JSX + local `Cell` with
      `PlanComparisonTable`, per the spec's exact prop shape. Delete the
      now-unused local `Cell` function.
- [ ] Commit: `feat: use the shared PlanComparisonTable component on the plan page`.

### Task 2: Docs

**Files:** `AGENTS.md` or this page's own README (whichever documents
it), `CHANGELOG.md`

- [ ] Note the migration and the new `@merqo/ui` dependency version.

### Task 3: Verification gate

- [ ] `pnpm check && pnpm test && pnpm build`.
- [ ] Push, PR, poll CI green (`gh pr checks <N> --watch` — block on it
      yourself, no monitor exists), squash-merge.

## Self-Review Notes

- Spec coverage: migration (Task 1), docs (Task 2), verification (Task 3).
- Confirmed the dependency (qkit's component build) actually landed
  before starting, not assumed.
