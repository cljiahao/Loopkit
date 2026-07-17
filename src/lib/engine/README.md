# engine

## Purpose

Pure, framework-free core logic for loopkit's reward mechanics — one
`Strategy<Config, State>` implementation per program type (stamp, lucky,
plant/cup, wheel/scratch), dispatched by program `type`.

## Contents

- `chance.ts` — `pickSegment`/`makeChanceStrategy`: weighted-random segment picker for wheel/scratch programs, with a `forceReward`/pity pool that restricts selection to reward-bearing segments; exports `wheelStrategy` and `scratchStrategy`
- `index.ts` — `resolve*Config`/`resolve*State` helpers plus `applyVisit`/`getProgress`, the dispatch layer that maps a `ProgramLike.type` ("lucky"/"plant"/"wheel"/"scratch"/"stamp") to the matching strategy's `apply`/`progress`
- `lucky.ts` — `luckyStrategy`: probability-roll-per-visit reward with a cooldown and a pity ceiling that guarantees a win by a configured visit count
- `plant.ts` — `plantStrategy`: growth-with-decay state machine (grows per visit, decays after a grace period, stages by threshold), `redeem` carries over excess growth into the next bloom cycle
- `stamp.ts` — `stampStrategy`: classic N-stamps-for-a-reward counter with `dots`/`flame`/`points` view variants and a configurable `points_per_visit` increment
- `types.ts` — shared `EngineEvent`, `ProgressView` (discriminated union: dots/flame/plant/chance), `Progress`, and the `Strategy<C, S>` interface every strategy file implements

## Parent

[lib](../README.md)
