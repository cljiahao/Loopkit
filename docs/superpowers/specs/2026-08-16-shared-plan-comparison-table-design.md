# Shared Plan Comparison Table — Design

**Date:** 2026-08-16
**Status:** Approved; plan to follow.

## Summary

loopkit's half of the shared `PlanComparisonTable` extraction — **read
qkit's own spec first**
(`../../qkit/docs/superpowers/specs/2026-08-16-shared-plan-comparison-table-design.md`),
which covers the full design (component API, why paykit/stockkit are out
of scope) and builds the component itself. This doc only covers loopkit's
own migration: replacing this page's local `FEATURES`-rendering grid with
the now-published `@merqo/ui` `PlanComparisonTable`.

Depends on qkit's own plan shipping the component to `@merqo/ui` first.

## Guiding decisions

- **loopkit's existing `FEATURES` array already matches the shared
  component's `boolean | string` cell type without modification** —
  `{ label: "Loyalty programs", free: "1", pro: "∞" }` and
  `{ label: "...", free: true, pro: true }` rows both map directly to
  `PlanComparisonRow.values`.
- **Only the grid moves** — the pricing card above it (the single Pro
  card, its copy, its `UpgradeCta`) is unchanged, matching qkit's own
  spec's reasoning for not extracting the cards.

## What changes

### `src/app/dashboard/plan/page.tsx`

Replace the local `FEATURES`-rendering JSX + local `Cell` with:

```tsx
<PlanComparisonTable
  tiers={[
    { key: "free", label: "Free" },
    { key: "pro", label: "Pro" },
  ]}
  rows={FEATURES.map((f) => ({
    label: f.label,
    values: { free: f.free, pro: f.pro },
  }))}
/>
```

`FEATURES`'s own const array stays local — only the rendering moves.
Delete the now-unused local `Cell` function.

## Testing

- Extend this page's existing test (if one covers the comparison grid) to
  assert against `PlanComparisonTable`'s rendered output instead of the
  deleted local markup.

## Self-review

- No placeholders.
- Confirmed loopkit's existing data shape needs zero transformation
  beyond the tiers/rows wrapper — not silently reshaping feature data to
  fit the component.

## Parent

[specs](README.md)
