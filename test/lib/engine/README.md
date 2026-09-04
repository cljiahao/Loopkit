# engine

## Purpose

Vitest unit tests for `src/lib/engine/` — the pure per-program-type reward
strategies and their dispatch layer.

## Contents

- `apply-visit.test.ts` — `applyVisit` dispatch: routes lucky/plant/stamp programs to the matching strategy's `apply`
- `chance.test.ts` — `pickSegment`/`makeChanceStrategy`: weighted segment selection and the pity/`forceReward` pool
- `index.test.ts` — `getProgress` dispatch: computes stamp/plant/chance progress views from a program's `config`/`state` blob
- `lucky.test.ts` — `luckyStrategy`: probability roll, cooldown, and pity-ceiling guaranteed win; `progress()` returns a `kind: "lucky"` view (`visitsSinceWin`/`pityCeiling`)
- `plant-apply-visit.test.ts` — `applyVisit`/`getProgress` for `type: "plant"` programs end to end through the dispatch layer
- `plant.test.ts` — `plantStrategy`: stage thresholds, growth, decay-after-grace-period, redeem carryover, how many reward thresholds a visit crossed, the cup variant's "Empty/Sip/Half Full/Nearly Full/Full" stage names, and `progress()`'s `filled`/`total` counter fields (rounded growth vs. the bloom threshold)
- `stamp.test.ts` — `stampStrategy`: stamp counting, `dots`/`flame`/`points` view variants, `points_per_visit` increment; also covers `stamp_mark` mode/preset passthrough and `stamp_style`/`stamp_color` passthrough into the dots view's new `style`/`color` fields, dropped for the `points` variant (which never renders `StampDots`)
- `threshold.test.ts` — `countThresholdCrossings`: multiples of `required` crossed between two counter values, including multi-threshold jumps

## Parent

[lib](../README.md)
