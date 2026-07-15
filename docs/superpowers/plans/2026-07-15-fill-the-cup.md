# Fill the Cup (Plant Reskin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Fill the Cup" as a visual variant of Plant's existing decay-aware growth mechanic — a cup filling with liquid instead of a plant growing — reusing Plant's engine entirely unchanged (`apply`/`redeem`/`decayedGrowth`/`stageIndexFor`/`bloomThreshold`), with zero database migration.

**Architecture:** `PlantConfig` gains an optional `variant: "plant" | "cup"` (default `"plant"`); `buildPlantConfig` (the config constructor) gains a `variant` parameter that picks between two fixed 5-name stage tables (Seed/Sprout/Leafing/Budding/Bloom vs. Empty/Sip/Quarter Full/Nearly Full/Full) at the _same_ thresholds — `plantStrategy`'s math never changes, only which name table `buildPlantConfig` baked into `config.stages`. Rather than a new `ProgressView` kind (what Flame Club did for Stamp), this follows the tighter `"chance"`-kind precedent already in this codebase: the existing `"plant"` view kind gains a `variant` field, and render sites pick `<Cup>` or `<Plant>` based on it — exactly how the `"chance"` kind's `variant` field already picks `<Wheel>` or `<ScratchCard>`. Fill the Cup appears in `/setup`'s type picker as its own tile but saves `type: "plant"` + `variant: "cup"` — never a new `ProgramType`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Zod, Vitest + Testing Library, Tailwind v4, SVG components.

## Global Constraints

- Every task's commit leaves `pnpm check` clean, full `pnpm test` passing, and `pnpm build` clean — this codebase has a documented history of Next.js Client/Server bundle-boundary errors that only surface in `pnpm build`, never in check/test.
- `plantStrategy.apply`/`redeem`/`decayedGrowth`/`stageIndexFor`/`bloomThreshold` in `src/lib/engine/plant.ts` must NOT change at all. Only `progress()`'s returned `view` gains one new field (`variant`) — no other logic in `plant.ts` changes.
- The 5 stage thresholds (0%, 25%, 50%, 75%, 100% of `visits_to_bloom`) are fixed literals, byte-identical between the `"plant"` and `"cup"` variants — never vendor-configurable, never diverged between the two name tables.
- **No new `ProgressView` top-level kind is introduced.** Fill the Cup reuses the existing `"plant"` kind with an added `variant: "plant" | "cup"` field, mirroring the existing `"chance"` kind's `variant: "wheel" | "scratch"` field exactly. Do not copy Flame Club's different approach (a whole new `"flame"` kind) — that was the right call for Stamp (whose `"dots"` view has no natural variant slot), but Plant's `"plant"` kind is structurally identical between variants (same `stage`/`stageName`/`totalStages`/`wilting` fields), so it takes the `"chance"`-kind shape instead.
- No database migration — `config` is jsonb, `type` stays `"plant"`, same reasoning as Flame Club.
- **Refinement of the approved spec's Section A** (flagged here so a fresh implementer doesn't second-guess it against the spec text): the spec describes `progress()` selecting the stage name from "a variant-keyed name table." In the actual current code, stage _names_ are already baked directly into `PlantConfig.stages[].name` by `buildPlantConfig` (the config constructor), not looked up separately inside `progress()`. The simpler, more minimal-diff implementation — used throughout this plan — puts the variant-to-name-table mapping inside `buildPlantConfig` itself (which already builds the `stages` array), so `plantStrategy.progress()` needs only ONE new line (`variant: config.variant ?? "plant"` in the returned view) instead of a whole new name-lookup mechanism. This still fully satisfies the spec's intent (stage names differ by variant, math untouched) and the binding constraint above (`apply`/`redeem`/`decayedGrowth`/`stageIndexFor`/`bloomThreshold` unchanged) — it is a tighter implementation of the same design, not a scope change.
- **Task ordering**: Task 1 is additive-only (engine + config layer, no consumer wiring). Task 2 wires the new `<Cup>` component into all 3 render sites (still defaults to `"plant"` everywhere — no UI offers `"cup"` yet). Task 3 wires the save-path and `/setup` UI so a vendor can genuinely create a Fill the Cup program — but the live preview will still render the Plant visual, not Cup, until Task 4 (a documented, non-broken intermediate state, matching the precedent Flame Club's Task 4→5 split established). Task 4 closes that gap and does the final verification sweep.

---

### Task 1: Engine + config layer — variant-aware Plant, new Cup component

**Files:**

- Modify: `src/lib/engine/plant.ts`
- Modify: `src/lib/engine/types.ts`
- Modify: `src/lib/program-config.ts`
- Modify: `test/lib/engine/plant.test.ts`
- Modify: `test/app/preview-state.test.ts`
- Modify: `test/app/dashboard-actions.test.ts`
- Modify: `src/app/setup/preview-card.dom.test.tsx`
- Modify: `test/app/serve-customer.test.tsx`
- Create: `src/components/cup.tsx`
- Create: `src/components/cup.dom.test.tsx`

**Interfaces:**

- Consumes: nothing from other tasks — this is the foundation task.
- Produces: `PlantConfig.variant?: "plant" | "cup"` (optional, default behavior when absent = `"plant"`); `buildPlantConfig(visitsToBloom: number, rewardText: string, variant: "plant" | "cup" = "plant"): PlantConfig`; `ProgressView`'s `"plant"` member gains `variant: "plant" | "cup"` (always populated at runtime); `Cup({ stage, totalStages, wilting, className? })` component with the exact same prop shape as the existing `Plant` component. Later tasks (2-4) consume all of these by name — do not rename any of them.

- [ ] **Step 1: Write the failing test for `buildPlantConfig`'s cup variant**

Add to `test/lib/engine/plant.test.ts` (new `describe` block at the end of the file, after the existing `describe("plantStrategy", ...)` block):

```ts
import { buildPlantConfig } from "@/lib/program-config";

describe("plantStrategy cup variant", () => {
  it("cup variant names stages Empty/Sip/Quarter Full/Nearly Full/Full at the same thresholds as plant", () => {
    const plantCfg = buildPlantConfig(8, "free kopi", "plant");
    const cupCfg = buildPlantConfig(8, "free kopi", "cup");
    expect(plantCfg.stages.map((s) => s.threshold)).toEqual(
      cupCfg.stages.map((s) => s.threshold),
    );
    expect(cupCfg.stages.map((s) => s.name)).toEqual([
      "Empty",
      "Sip",
      "Quarter Full",
      "Nearly Full",
      "Full",
    ]);
    expect(plantCfg.stages.map((s) => s.name)).toEqual([
      "Seed",
      "Sprout",
      "Leafing",
      "Budding",
      "Bloom",
    ]);
  });

  it("defaults to plant variant when omitted", () => {
    const cfg = buildPlantConfig(8, "free kopi");
    expect(cfg.variant).toBe("plant");
    expect(cfg.stages[0].name).toBe("Seed");
  });

  it("progress() reports the cup variant in its view", () => {
    const cupCfg = buildPlantConfig(8, "free kopi", "cup");
    const p = plantStrategy.progress(
      { growth: 4, last_visit_at: null, blooms: 0 },
      cupCfg,
      new Date("2026-07-07T00:00:00Z"),
    );
    expect(p.view).toMatchObject({ kind: "plant", variant: "cup" });
    expect(p.stage).toBe("Quarter Full");
  });

  it("progress() defaults to plant variant when config.variant is absent", () => {
    const p = plantStrategy.progress(
      { growth: 4, last_visit_at: null, blooms: 0 },
      cfg,
      new Date("2026-07-07T00:00:00Z"),
    );
    expect(p.view).toMatchObject({ kind: "plant", variant: "plant" });
  });

  it("cup variant wilts and floors exactly like plant", () => {
    const cupCfg = buildPlantConfig(8, "free kopi", "cup");
    const p = plantStrategy.progress(
      { growth: 6, last_visit_at: "2026-07-01T00:00:00Z", blooms: 0 },
      cupCfg,
      new Date("2026-07-30T00:00:00Z"),
    );
    expect(p.view).toMatchObject({
      kind: "plant",
      variant: "cup",
      wilting: true,
    });
    expect(p.stage).toBe("Sip");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run test/lib/engine/plant.test.ts`
Expected: FAIL — `buildPlantConfig` import fails to resolve the 3-arg overload / `variant` is `undefined` on the returned config and view.

- [ ] **Step 3: Update `src/lib/program-config.ts` — variant-aware `buildPlantConfig`**

Replace the existing `buildPlantConfig` function (and the comment above it) with:

```ts
const PLANT_STAGE_NAMES = ["Seed", "Sprout", "Leafing", "Budding", "Bloom"];
const CUP_STAGE_NAMES = ["Empty", "Sip", "Quarter Full", "Nearly Full", "Full"];

// Derive a Plant/Cup program's config from the single vendor-facing knob
// (visits to bloom/fill): five stages at even quarters up to the top
// threshold, a floor at the second stage so a wilted card never dies, and
// fixed grace/decay — identical math for both variants. `variant` only
// selects which stage-name table gets baked into `stages[].name`; the
// thresholds themselves never differ between "plant" and "cup".
export function buildPlantConfig(
  visitsToBloom: number,
  rewardText: string,
  variant: "plant" | "cup" = "plant",
): PlantConfig {
  const b = visitsToBloom;
  const names = variant === "cup" ? CUP_STAGE_NAMES : PLANT_STAGE_NAMES;
  const thresholds = [
    0,
    Math.round(b * 0.25),
    Math.round(b * 0.5),
    Math.round(b * 0.75),
    b,
  ];
  const stages = names.map((name, i) => ({ name, threshold: thresholds[i] }));
  return {
    stages,
    growth_per_visit: 1,
    grace_days: 5,
    decay_rate: 0.5,
    floor_growth: stages[1].threshold,
    reward_text: rewardText,
    variant,
  };
}
```

- [ ] **Step 4: Update `src/lib/engine/plant.ts` — `PlantConfig` gains `variant`, `progress()` reports it**

In the `PlantConfig` type, add one optional field:

```ts
export type PlantConfig = {
  stages: PlantStage[];
  growth_per_visit: number;
  grace_days: number;
  decay_rate: number;
  floor_growth: number;
  reward_text: string;
  variant?: "plant" | "cup";
};
```

In `plantStrategy.progress()`, add one field to the returned `view` object (everything else in this function, and every other function in this file, stays byte-identical):

```ts
  progress(state, config, now) {
    const g = decayedGrowth(state, config, now);
    const idx = stageIndexFor(g, config.stages);
    const wilting = g < state.growth;
    return {
      stage: config.stages[idx].name,
      label: wilting ? "Wilting — visit to revive it" : config.stages[idx].name,
      view: {
        kind: "plant",
        stage: idx,
        stageName: config.stages[idx].name,
        totalStages: config.stages.length,
        wilting,
        variant: config.variant ?? "plant",
      },
      rewardReady: state.bloomed ?? g >= bloomThreshold(config),
    };
  },
```

- [ ] **Step 5: Update `src/lib/engine/types.ts` — `ProgressView`'s `"plant"` member gains `variant`**

```ts
  | {
      kind: "plant";
      stage: number;
      stageName: string;
      totalStages: number;
      wilting: boolean;
      variant: "plant" | "cup";
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run test/lib/engine/plant.test.ts`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 7: Fix existing test fixtures broken by `ProgressView`'s now-required `variant` field**

`ProgressView`'s `"plant"` member's new `variant` field is required (not optional) — three existing files construct `"plant"`-kind view objects directly (not via `plantStrategy.progress()`) and will fail `tsc`/exact-match assertions without this fix. This is a necessary, minimal consequence of Step 5's type change, not scope creep — the same class of fix Flame Club's Task 2 needed for `Program`'s new required field.

In `test/app/preview-state.test.ts`, add `variant: "plant"` to the three existing `toEqual` assertions on plant views (search for `kind: "plant"` — there are 3 occurrences, at the "fresh card starts at Seed", "head start floors growth at the Sprout stage", and "a low head-start percent still floors at the Sprout stage" tests). Example for the first:

```ts
it("plant: fresh card starts at Seed", () => {
  const progress = buildPreviewProgress({ ...base, type: "plant" });
  expect(progress.view).toEqual({
    kind: "plant",
    stage: 0,
    stageName: "Seed",
    totalStages: 5,
    wilting: false,
    variant: "plant",
  });
});
```

Apply the same one-line addition (`variant: "plant",`) to the other two `kind: "plant"` `toEqual` blocks in this file.

In `test/app/dashboard-actions.test.ts`, find the `toEqual` assertion around `kind: "plant"` (inside the `redeemPlantAction` test) and add `variant: "plant"`:

```ts
expect(res.progress.view).toEqual({
  kind: "plant",
  stage: 0,
  stageName: "Seed",
  totalStages: 5,
  wilting: false,
  variant: "plant",
});
```

In `src/app/setup/preview-card.dom.test.tsx`, find the `Progress` literal in the "renders the plant visual for a plant view" test and add `variant: "plant"`:

```ts
      view: {
        kind: "plant",
        stage: 1,
        stageName: "Sprout",
        totalStages: 5,
        wilting: false,
        variant: "plant",
      },
```

In `test/app/serve-customer.test.tsx`, find the mocked `view` object in the "shows carryover wording in the plant redeem confirm dialog" test and add `variant: "plant"`:

```ts
        view: {
          kind: "plant",
          stage: 4,
          stageName: "Bloom",
          totalStages: 5,
          wilting: false,
          variant: "plant",
        },
```

- [ ] **Step 8: Write the failing test for the new `Cup` component**

Create `src/components/cup.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Cup } from "@/components/cup";

describe("Cup", () => {
  it("renders an svg", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders no liquid fill at stage 0 (Empty)", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    // Only the cup outline path + handle path + shadow ellipse — no fill rect
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });

  it("renders a liquid fill rect once growth has started", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    expect(container.querySelectorAll("rect")).toHaveLength(1);
  });

  it("renders latte art only at the Full stage", () => {
    const notFull = render(<Cup stage={3} totalStages={5} wilting={false} />);
    expect(notFull.container.querySelectorAll("circle")).toHaveLength(0);
    const full = render(<Cup stage={4} totalStages={5} wilting={false} />);
    expect(full.container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("dims the liquid color when wilting", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={true} />,
    );
    const rect = container.querySelector("rect");
    expect(rect?.getAttribute("class")).toContain("fill-muted-foreground");
  });
});
```

- [ ] **Step 9: Run the test to verify it fails**

Run: `pnpm vitest run src/components/cup.dom.test.tsx`
Expected: FAIL — `Cannot find module '@/components/cup'`

- [ ] **Step 10: Create `src/components/cup.tsx`**

```tsx
import { cn } from "@/lib/utils";

export function Cup({
  stage,
  totalStages,
  wilting,
  className,
}: {
  stage: number;
  totalStages: number;
  wilting: boolean;
  className?: string;
}) {
  const span = Math.max(totalStages - 1, 1);
  const frac = Math.min(Math.max(stage / span, 0), 1);
  const cupTopY = 30;
  const cupBottomY = 80;
  const liquidTopY = cupBottomY - (cupBottomY - cupTopY) * frac;
  const isFull = stage >= totalStages - 1 && totalStages > 1;

  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn(
        "size-32",
        wilting ? "text-muted-foreground" : "text-primary",
        className,
      )}
    >
      <ellipse
        cx="50"
        cy="90"
        rx="26"
        ry="4"
        className="fill-muted-foreground/15"
      />
      <defs>
        <clipPath id="cup-body-clip">
          <path d="M25 30 L75 30 L65 80 L35 80 Z" />
        </clipPath>
      </defs>
      {frac > 0 && (
        <rect
          x="20"
          y={liquidTopY}
          width="60"
          height={cupBottomY - liquidTopY}
          clipPath="url(#cup-body-clip)"
          className={cn(
            "motion-safe:transition-all motion-safe:duration-500",
            wilting ? "fill-muted-foreground/50" : "fill-primary/60",
          )}
        />
      )}
      <path
        d="M25 30 L75 30 L65 80 L35 80 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M75 38 q14 0 14 14 q0 14 -14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {isFull && (
        <g>
          <circle
            cx="43"
            cy={liquidTopY + 2}
            r="6"
            className={wilting ? "fill-muted-foreground/50" : "fill-gold"}
          />
          <circle
            cx="55"
            cy={liquidTopY + 2}
            r="6"
            className={wilting ? "fill-muted-foreground/50" : "fill-gold"}
          />
          <path
            d={`M40 ${liquidTopY + 6} L50 ${liquidTopY + 16} L60 ${liquidTopY + 6} Z`}
            className={
              wilting ? "fill-muted-foreground" : "fill-gold-foreground"
            }
          />
        </g>
      )}
    </svg>
  );
}
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `pnpm vitest run src/components/cup.dom.test.tsx`
Expected: PASS (all 5 tests)

- [ ] **Step 12: Run the full suite, check, and build**

```bash
pnpm check
pnpm test
pnpm build
```

Expected: all clean. Full test count will have grown by 4 (`plant.test.ts`) + 5 (`cup.dom.test.tsx`) = 9 new tests; the 5 fixed-fixture files' existing test counts stay the same (their assertions were edited in place, not added).

- [ ] **Step 13: Commit**

```bash
git add src/lib/engine/plant.ts src/lib/engine/types.ts src/lib/program-config.ts \
  src/components/cup.tsx src/components/cup.dom.test.tsx \
  test/lib/engine/plant.test.ts test/app/preview-state.test.ts \
  test/app/dashboard-actions.test.ts src/app/setup/preview-card.dom.test.tsx \
  test/app/serve-customer.test.tsx
git commit -m "feat: variant-aware Plant engine (plant/cup), new Cup component"
```

---

### Task 2: Wire `<Cup>` into all 3 render sites

**Files:**

- Modify: `src/app/c/program-card-status.tsx`
- Modify: `src/app/dashboard/serve-customer.tsx`
- Modify: `src/app/setup/preview-card.tsx`

**Interfaces:**

- Consumes: `Cup` component from Task 1 (`@/components/cup`, props `{stage, totalStages, wilting, className?}`); `ProgressView`'s `"plant"` member's `variant` field from Task 1.
- Produces: nothing new later tasks depend on programmatically — this task only changes JSX branching in leaf render components. After this task, every `view.kind === "plant"` branch anywhere in the app correctly dispatches on `view.variant`, but no UI yet lets a vendor create a `variant: "cup"` program (that's Task 3), so this task's new branches are unreachable in production until Task 3 ships — verified by tests using literal `Progress`/`ProgressView` fixtures, same testing approach Flame Club's Task 3 used.

- [ ] **Step 1: Write the failing test for `program-card-status.tsx`'s cup branch**

Find (or create, matching this repo's convention) `src/app/c/program-card-status.dom.test.tsx`. If it doesn't already exist, create it with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ProgramCardStatus } from "@/app/c/program-card-status";
import type { CardStatus } from "@/app/c/status-state";

function baseCard(overrides: Partial<CardStatus>): CardStatus {
  return {
    programId: "p1",
    name: "Grow-a-kopi",
    label: "Sip",
    reward_text: "Free kopi",
    rewardReady: false,
    expired: false,
    active: true,
    replacedByName: null,
    carriedOverCount: null,
    qr: null,
    view: {
      kind: "plant",
      stage: 1,
      stageName: "Sip",
      totalStages: 5,
      wilting: false,
      variant: "cup",
    },
    ...overrides,
  } as CardStatus;
}

describe("ProgramCardStatus cup variant", () => {
  it("renders the Cup visual (not Plant) when view.variant is cup", () => {
    const { container } = render(
      <ProgramCardStatus card={baseCard({})} phone="+6591234567" />,
    );
    // Cup draws exactly one clipPath (defs > clipPath#cup-body-clip); Plant never does.
    expect(container.querySelector("#cup-body-clip")).toBeInTheDocument();
  });

  it("renders the Plant visual (not Cup) when view.variant is plant", () => {
    const { container } = render(
      <ProgramCardStatus
        card={baseCard({
          view: {
            kind: "plant",
            stage: 1,
            stageName: "Sprout",
            totalStages: 5,
            wilting: false,
            variant: "plant",
          },
        })}
        phone="+6591234567"
      />,
    );
    expect(container.querySelector("#cup-body-clip")).not.toBeInTheDocument();
  });
});
```

If `program-card-status.dom.test.tsx` already exists with different fixture helpers, add these two `it` blocks to its existing `describe` block instead of creating a new file — match the existing file's `CardStatus` fixture style rather than duplicating one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/app/c/program-card-status.dom.test.tsx`
Expected: FAIL — the plant branch always renders `<Plant>`, so `#cup-body-clip` is never present.

- [ ] **Step 3: Update `src/app/c/program-card-status.tsx`**

Add the `Cup` import:

```ts
import { Cup } from "@/components/cup";
```

Replace the `view?.kind === "plant"` branch:

```tsx
      {view?.kind === "plant" ? (
        <div className="flex flex-col items-center gap-2">
          {view.variant === "cup" ? (
            <Cup
              stage={view.stage}
              totalStages={view.totalStages}
              wilting={view.wilting}
            />
          ) : (
            <Plant
              stage={view.stage}
              totalStages={view.totalStages}
              wilting={view.wilting}
            />
          )}
        </div>
      ) : view?.kind === "flame" ? (
```

(Only the `"plant"` branch changes — the `"flame"`/`"chance"`/`"dots"` branches stay exactly as they are.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/app/c/program-card-status.dom.test.tsx`
Expected: PASS (both new tests)

- [ ] **Step 5: Write the failing test for `serve-customer.tsx`'s cup branch**

In `test/app/serve-customer.test.tsx`, add a new test (matching the existing "shows carryover wording in the plant redeem confirm dialog" test's mocking style — reuse whatever `lookupMock`/render setup that test already uses):

```tsx
it("renders the Cup visual for a cup-variant plant program", async () => {
  lookupMock.mockResolvedValue({
    success: true,
    card: { id: "card-1", phone: "+6591234567", stamp_count: 0 },
    progress: {
      view: {
        kind: "plant",
        stage: 2,
        stageName: "Quarter Full",
        totalStages: 5,
        wilting: false,
        variant: "cup",
      },
      label: "Quarter Full",
      rewardReady: false,
    },
  });
  const user = userEvent.setup();
  const { container } = render(
    <ServeCustomer
      programId="p1"
      type="plant"
      stampsRequired={8}
      rewardText="Free kopi"
    />,
  );
  await user.type(screen.getByLabelText("Customer phone"), "91234567");
  await user.click(screen.getByRole("button", { name: "Look up" }));
  await waitFor(() =>
    expect(container.querySelector("#cup-body-clip")).toBeInTheDocument(),
  );
});
```

Adjust the exact mock/render boilerplate (imports, `screen`/`userEvent`/`waitFor` setup) to match whatever this file's existing plant tests already use — read the existing "shows carryover wording" test immediately above this one for the precise pattern before writing this addition.

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm vitest run test/app/serve-customer.test.tsx`
Expected: FAIL — the plant branch always renders `<Plant>`.

- [ ] **Step 7: Update `src/app/dashboard/serve-customer.tsx`**

Add the `Cup` import:

```ts
import { Cup } from "@/components/cup";
```

Replace the `<Plant .../>` element inside the `result?.mode === "plant"` block:

```tsx
          <div className="flex items-center gap-4">
            {result.view.variant === "cup" ? (
              <Cup
                stage={result.view.stage}
                totalStages={result.view.totalStages}
                wilting={result.view.wilting}
                className="size-24 shrink-0"
              />
            ) : (
              <Plant
                stage={result.view.stage}
                totalStages={result.view.totalStages}
                wilting={result.view.wilting}
                className="size-24 shrink-0"
              />
            )}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm vitest run test/app/serve-customer.test.tsx`
Expected: PASS

- [ ] **Step 9: Write the failing test for `preview-card.tsx`'s cup branch**

In `src/app/setup/preview-card.dom.test.tsx`, add a new test to the existing `describe("PreviewCard", ...)` block:

```tsx
it("renders the cup visual for a cup-variant plant view", () => {
  const progress: Progress = {
    stage: "Sip",
    label: "Sip",
    view: {
      kind: "plant",
      stage: 1,
      stageName: "Sip",
      totalStages: 5,
      wilting: false,
      variant: "cup",
    },
    rewardReady: false,
  };
  const { container } = render(
    <PreviewCard
      progress={progress}
      name="Fill-a-kopi"
      rewardText="Free kopi"
    />,
  );
  expect(container.querySelector("#cup-body-clip")).toBeInTheDocument();
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `pnpm vitest run src/app/setup/preview-card.dom.test.tsx`
Expected: FAIL

- [ ] **Step 11: Update `src/app/setup/preview-card.tsx`**

Add the `Cup` import:

```ts
import { Cup } from "@/components/cup";
```

Replace the `view.kind === "plant"` branch:

```tsx
        {view.kind === "plant" ? (
          view.variant === "cup" ? (
            <Cup
              stage={view.stage}
              totalStages={view.totalStages}
              wilting={view.wilting}
            />
          ) : (
            <Plant
              stage={view.stage}
              totalStages={view.totalStages}
              wilting={view.wilting}
            />
          )
        ) : view.kind === "flame" ? (
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `pnpm vitest run src/app/setup/preview-card.dom.test.tsx`
Expected: PASS

- [ ] **Step 13: Run the full suite, check, and build**

```bash
pnpm check
pnpm test
pnpm build
```

Expected: all clean.

- [ ] **Step 14: Commit**

```bash
git add src/app/c/program-card-status.tsx src/app/c/program-card-status.dom.test.tsx \
  src/app/dashboard/serve-customer.tsx test/app/serve-customer.test.tsx \
  src/app/setup/preview-card.tsx src/app/setup/preview-card.dom.test.tsx
git commit -m "feat: wire the Cup visual into all 3 program-status render sites"
```

---

### Task 3: Save-path wiring + `/setup` UI — the Fill the Cup tile

**Files:**

- Modify: `src/lib/program.ts`
- Modify: `src/app/setup/setup-form.tsx`
- Modify: `src/app/setup/preview-state.ts`
- Modify: `test/lib/save-program-schema.test.ts`
- Modify: `test/lib/build-program-fields.test.ts`
- Modify: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: `buildPlantConfig`'s 3-arg signature from Task 1 (not yet threaded through `preview-state.ts`'s actual call — only the type is widened here, matching the documented intermediate-state pattern).
- Produces: `saveProgramSchema`'s plant variant gains optional `variant: "plant" | "cup"`; `buildProgramFields`'s plant branch passes `data.variant ?? "plant"` into `buildPlantConfig`; `setup-form.tsx` has a working "Fill the Cup" tile that submits `type=plant, variant=cup` in `FormData`. **Known, deliberate gap this task leaves open**: `/setup`'s live preview (`PreviewCard`) will still render the Plant visual (not Cup) when "Fill the Cup" is selected, because `preview-state.ts`'s `buildPreviewProgram` doesn't yet pass `variant` into `buildPlantConfig` — Task 4 closes this. This does not affect what gets saved to the database; only the live preview lags by one task, exactly like Flame Club's Task 4→5 split.

- [ ] **Step 1: Write the failing test for `saveProgramSchema`'s plant variant field**

Add to `test/lib/save-program-schema.test.ts`, near the existing plant tests:

```ts
it("accepts a plant program with variant=cup", () => {
  const result = saveProgramSchema.safeParse({
    type: "plant",
    name: "Fill-a-kopi",
    reward_text: "Free kopi",
    visits_to_bloom: "6",
    head_start: "false",
    variant: "cup",
  });
  expect(result.success).toBe(true);
});

it("rejects a plant program with an invalid variant", () => {
  const result = saveProgramSchema.safeParse({
    type: "plant",
    name: "Fill-a-kopi",
    reward_text: "Free kopi",
    visits_to_bloom: "6",
    head_start: "false",
    variant: "bogus",
  });
  expect(result.success).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/lib/save-program-schema.test.ts`
Expected: FAIL — `variant` is an unrecognized key on the plant schema (Zod strips or the schema doesn't parse it as expected, first test fails since success is still `true` regardless but for the wrong reason — the second test currently passes by coincidence since Zod ignores unknown keys by default, so add both to lock in the _intended_ behavior once the field exists).

- [ ] **Step 3: Update `src/lib/program.ts` — schema and `buildProgramFields`**

In `saveProgramSchema`'s `type: z.literal("plant")` object, add:

```ts
  z.object({
    type: z.literal("plant"),
    name: z.string().trim().min(1).max(60),
    reward_text: z.string().trim().min(1).max(80),
    visits_to_bloom: z.coerce.number().int().min(4).max(20),
    head_start: z.enum(["true", "false"]).transform((v) => v === "true"),
    head_start_percent: z.preprocess(
      emptyToUndefined,
      z.coerce.number().int().min(5).max(50).optional(),
    ),
    variant: z.preprocess(
      emptyToUndefined,
      z.enum(["plant", "cup"]).optional(),
    ),
    expiry_days: expiryDaysSchema,
  }),
```

In `buildProgramFields`'s `data.type === "plant"` branch:

```ts
if (data.type === "plant") {
  return {
    type: "plant",
    stampsRequired: data.visits_to_bloom,
    headStart: data.head_start,
    headStartPercent: data.head_start_percent ?? 20,
    config: buildPlantConfig(
      data.visits_to_bloom,
      data.reward_text,
      data.variant ?? "plant",
    ) as Json,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/lib/save-program-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `buildProgramFields`'s plant variant**

Add to `test/lib/build-program-fields.test.ts`, near the existing plant test:

```ts
it("builds a cup-variant plant program's config with the cup stage names", () => {
  const result = buildProgramFields({
    type: "plant",
    name: "Fill-a-kopi",
    reward_text: "Free kopi",
    visits_to_bloom: 8,
    head_start: false,
    expiry_days: undefined,
    variant: "cup",
  } as SaveProgramInput);

  expect(result.type).toBe("plant");
  expect(result.config).toMatchObject({
    variant: "cup",
    stages: [
      { name: "Empty", threshold: 0 },
      { name: "Sip", threshold: 2 },
      { name: "Quarter Full", threshold: 4 },
      { name: "Nearly Full", threshold: 6 },
      { name: "Full", threshold: 8 },
    ],
  });
});

it("defaults plant variant to 'plant' when absent", () => {
  const result = buildProgramFields({
    type: "plant",
    name: "Grow-a-kopi",
    reward_text: "Free kopi",
    visits_to_bloom: 6,
    head_start: false,
    expiry_days: undefined,
  } as SaveProgramInput);

  expect(result.config).toMatchObject({ variant: "plant" });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm vitest run test/lib/build-program-fields.test.ts`
Expected: FAIL — `buildPlantConfig` isn't yet receiving the `variant` argument from `buildProgramFields` until Step 3 above is applied. (If Step 3 was already done in this same task run, this test should already pass — run Steps 1-6 in the written order to keep the TDD loop honest per-concern.)

- [ ] **Step 7: Confirm the test passes**

Run: `pnpm vitest run test/lib/build-program-fields.test.ts`
Expected: PASS

- [ ] **Step 8: Widen `PreviewInput.variant`'s type in `src/app/setup/preview-state.ts`**

This is a type-only change — no behavior change in this task. Update:

```ts
export type PreviewInput = {
  type: ProgramType;
  name: string;
  rewardText: string;
  stampsRequired: number;
  visitsToBloom: number;
  winPercent: number;
  pityCeiling: number | undefined;
  segments: { label: string; weight: number; is_reward: boolean }[];
  headStart: boolean;
  headStartPercent: number;
  variant: "dots" | "flame" | "plant" | "cup";
};
```

(`buildPreviewProgram`'s plant branch is intentionally left unchanged in this task — it still calls `buildPlantConfig(input.visitsToBloom, input.rewardText)` with no 3rd argument, so the live preview keeps showing the Plant visual for now. Task 4 closes this gap.)

- [ ] **Step 9: Write the failing test for the `/setup` Fill the Cup tile**

Add to `src/app/setup/setup-form.dom.test.tsx`, near the existing "Flame Club tile" test:

```tsx
it("Fill the Cup tile saves type=plant with variant=cup and the fill-specific label", async () => {
  const user = userEvent.setup();
  render(
    <SetupForm
      program={null}
      isEdit={false}
      replacingId={null}
      replacingType={null}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Fill the Cup" }));
  expect(screen.getByText("Visits to fill")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Card name"), "Fill-a-kopi");
  await user.type(screen.getByLabelText("Reward"), "Free kopi");
  await user.click(screen.getByRole("button", { name: "Create card" }));

  expect(saveMock).toHaveBeenCalled();
  const submitted = saveMock.mock.calls[0][1] as FormData;
  expect(submitted.get("type")).toBe("plant");
  expect(submitted.get("variant")).toBe("cup");
});

it("Sprout tile still saves type=plant with variant=plant and the bloom-specific label", async () => {
  const user = userEvent.setup();
  render(
    <SetupForm
      program={null}
      isEdit={false}
      replacingId={null}
      replacingType={null}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Sprout" }));
  expect(screen.getByText("Visits to bloom")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Card name"), "Grow-a-kopi");
  await user.type(screen.getByLabelText("Reward"), "Free kopi");
  await user.click(screen.getByRole("button", { name: "Create card" }));

  expect(saveMock).toHaveBeenCalled();
  const submitted = saveMock.mock.calls[0][1] as FormData;
  expect(submitted.get("type")).toBe("plant");
  expect(submitted.get("variant")).toBe("plant");
});
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: FAIL — no "Fill the Cup" button exists yet, and the plant tile doesn't submit a `variant` field at all.

- [ ] **Step 11: Update `src/app/setup/setup-form.tsx`**

Widen `TypeOptionValue` and `typeLabels`:

```ts
type TypeOptionValue =
  "stamp" | "flame" | "lucky" | "plant" | "cup" | "wheel" | "scratch";

const typeLabels: Record<TypeOptionValue, string> = {
  stamp: "Stamp card",
  flame: "Flame Club",
  lucky: "Lucky Tap",
  plant: "Sprout",
  cup: "Fill the Cup",
  wheel: "Spin the Wheel",
  scratch: "Scratch Card",
};
```

Add the `cup` entry to `TYPE_OPTIONS`, immediately after `plant`:

```ts
const TYPE_OPTIONS = [
  {
    value: "stamp",
    label: "Stamp card",
    description: "Collect stamps toward a reward",
  },
  {
    value: "flame",
    label: "Flame Club",
    description: "Build a flame with every visit",
  },
  {
    value: "lucky",
    label: "Lucky Tap",
    description: "A chance to win on every visit",
  },
  {
    value: "plant",
    label: "Sprout",
    description: "Grow a plant with every visit",
  },
  {
    value: "cup",
    label: "Fill the Cup",
    description: "Fill a cup with every visit",
  },
  {
    value: "wheel",
    label: "Spin the Wheel",
    description: "Spin for a prize on every visit",
  },
  {
    value: "scratch",
    label: "Scratch Card",
    description: "Scratch for a prize on every visit",
  },
] as const;
```

Widen the `variant` state's type and its initial-value logic:

```ts
const [variant, setVariant] = useState<"dots" | "flame" | "plant" | "cup">(
  () => {
    if (config.variant === "flame") return "flame";
    if (config.variant === "cup") return "cup";
    return initialType === "plant" ? "plant" : "dots";
  },
);
```

Update `selectedOptionKey`:

```ts
const selectedOptionKey: TypeOptionValue =
  type === "stamp" && variant === "flame"
    ? "flame"
    : type === "plant" && variant === "cup"
      ? "cup"
      : (type as TypeOptionValue);
```

Update `pickType`:

```ts
function pickType(value: TypeOptionValue) {
  setType(value === "flame" ? "stamp" : value === "cup" ? "plant" : value);
  setVariant(
    value === "flame"
      ? "flame"
      : value === "cup"
        ? "cup"
        : value === "stamp"
          ? "dots"
          : value === "plant"
            ? "plant"
            : "dots",
  );
  setName("");
  setRewardText("");
  setStampsRequired(10);
  setVisitsToBloom(6);
  setWinPercent(20);
  setPityCeiling(value === "lucky" ? 8 : undefined);
  setHeadStartPercent(20);
}
```

Widen the hidden `variant` mirror input's guard condition (currently `type === "stamp"` only):

```tsx
{
  type === "stamp" || type === "plant" ? (
    <input type="hidden" name="variant" value={variant} />
  ) : null;
}
```

Make the `visits_to_bloom` field's label conditional (inside the `type === "plant"` branch):

```tsx
                <div className="space-y-2">
                  <Label htmlFor="visits_to_bloom" className={labelClass}>
                    {variant === "cup" ? "Visits to fill" : "Visits to bloom"}
                  </Label>
```

Thread `variant` into the `usePreviewAnimation` call (it is already there for the stamp/flame case — no change needed to the call itself, since `variant` is already one shared field passed through; this step is a no-op confirmation, not an edit — verify the existing `usePreviewAnimation({ ..., variant })` call is unchanged and still compiles once `PreviewInput.variant`'s type was widened in Step 8).

- [ ] **Step 12: Run the test to verify it passes**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS (both new tests, plus all pre-existing tests in this file still passing)

- [ ] **Step 13: Run the full suite, check, and build**

```bash
pnpm check
pnpm test
pnpm build
```

Expected: all clean.

- [ ] **Step 14: Commit**

```bash
git add src/lib/program.ts src/app/setup/setup-form.tsx src/app/setup/preview-state.ts \
  test/lib/save-program-schema.test.ts test/lib/build-program-fields.test.ts \
  src/app/setup/setup-form.dom.test.tsx
git commit -m "feat: Fill the Cup tile in /setup, save-path variant wiring for Plant"
```

---

### Task 4: Live-preview wiring + final verification

**Files:**

- Modify: `src/app/setup/preview-state.ts`
- Modify: `test/app/preview-state.test.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: `PreviewInput.variant`'s widened type from Task 3; `buildPlantConfig`'s 3-arg signature from Task 1.
- Produces: nothing later tasks depend on — this is the final task. After this task, the `/setup` live preview genuinely renders `<Cup>` when Fill the Cup is selected, closing the gap Task 3 deliberately left open.

- [ ] **Step 1: Write the failing test for the preview's cup variant**

Add to `test/app/preview-state.test.ts`, near the existing plant tests:

```ts
it("plant: cup variant shows the cup stage names", () => {
  const progress = buildPreviewProgress({
    ...base,
    type: "plant",
    variant: "cup",
  });
  expect(progress.view).toEqual({
    kind: "plant",
    stage: 0,
    stageName: "Empty",
    totalStages: 5,
    wilting: false,
    variant: "cup",
  });
});

it("plant: cup variant head start floors growth at the Sip stage, same as plant floors at Sprout", () => {
  const progress = buildPreviewProgress({
    ...base,
    type: "plant",
    variant: "cup",
    headStart: true,
  });
  expect(progress.view).toEqual({
    kind: "plant",
    stage: 1,
    stageName: "Sip",
    totalStages: 5,
    wilting: false,
    variant: "cup",
  });
});
```

Also update the shared `base` fixture at the top of this file to include `variant: "dots" as const,` (it likely already does, from Flame Club's Task 5 — confirm rather than duplicate; if it's missing, add it).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/app/preview-state.test.ts`
Expected: FAIL — `buildPreviewProgram`'s plant branch doesn't read `input.variant` yet, so the preview always shows Plant's name table regardless of the requested variant.

- [ ] **Step 3: Update `src/app/setup/preview-state.ts`**

In `buildPreviewProgram`, update the plant branch:

```ts
if (input.type === "plant") {
  return {
    type: "plant",
    stamps_required: input.visitsToBloom,
    reward_text: input.rewardText,
    config: buildPlantConfig(
      input.visitsToBloom,
      input.rewardText,
      input.variant === "cup" ? "cup" : "plant",
    ),
  };
}
```

`buildInitialCard`'s plant branch is unchanged — head-start growth seeding has no variant-specific behavior (matches the spec's Section G: "no animation-timing changes needed").

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/app/preview-state.test.ts`
Expected: PASS

- [ ] **Step 5: Update `README.md`**

In the file-layout summary line for `src/components/`, add `cup`:

```
src/components/         — wheel, scratch-card, flame-layers, cup, stamp-dots, etc.
```

- [ ] **Step 6: Run the full repo-wide verification grep**

Run: `grep -rin "cup" --include="*.ts" --include="*.tsx" src/ test/ | grep -v "\.test\."`

Expected: hits confined to the intentional production files this plan touched — `src/lib/program-config.ts` (the `CUP_STAGE_NAMES` table and `buildPlantConfig`'s `variant` param), `src/lib/engine/plant.ts`/`types.ts` (the `"plant" | "cup"` union), `src/components/cup.tsx`, `src/app/setup/setup-form.tsx` (the tile), `src/app/c/program-card-status.tsx`, `src/app/dashboard/serve-customer.tsx`, `src/app/setup/preview-card.tsx` (the 3 render-site branches), `src/app/setup/preview-state.ts` (the type + branch). If anything else appears, investigate before finishing — it may indicate a stray/duplicated implementation.

Run a second grep confirming no accidental new `ProgressView` top-level kind was introduced (the plan's most likely mis-scoping risk, called out in Global Constraints):

`grep -n "kind: \"cup\"" src/lib/engine/types.ts` — expected: no output (there is no `"cup"` kind; Cup is a `variant` of the `"plant"` kind).

- [ ] **Step 7: Run the full suite, check, and build**

```bash
pnpm check
pnpm test
pnpm build
```

Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add src/app/setup/preview-state.ts test/app/preview-state.test.ts README.md
git commit -m "feat: thread the cup variant through the /setup live preview"
```
