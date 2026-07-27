# Flame Club 3 → 5 Stages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Flame Club stamp-card visual from 3 hardcoded stages to 5 even-bucket stages, with a redrawn `FlameLayers` component (ember dot, 1-icon spark, 3-layered fire, woodpile base).

**Architecture:** A pure engine change (`flameStageFor` moves from 2 ratio comparisons to a 5-bucket loop mirroring `Plant`'s `stageIndexFor`) feeds a rebuilt `FlameLayers` component that maps `stage` (0-4) directly to icon count/size/color — no new props needed since `FlameLayers` never took `totalStages` in the first place and stays that way (Plant/Cup already show the pattern of a component with hardcoded stage-count assumptions).

**Tech Stack:** TypeScript, React 19, Tailwind v4, lucide-react, Vitest + Testing Library (jsdom).

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Fire's palette is fixed regardless of vendor brand color (same category as the fixed-gold reward-moment convention) — never theme it via `text-primary`.
- Testing convention: `*.dom.test.tsx` assertions on class names/rendered content, not pixel-level visual testing.
- Run `pnpm check` before declaring the task done.

---

### Task 1: Engine — 5-bucket `flameStageFor`

**Files:**

- Modify: `src/lib/engine/stamp.ts`
- Test: `test/lib/engine/stamp.test.ts`

**Interfaces:**

- Produces: `stampStrategy.progress()`'s `flame` view now returns `totalStages: 5` and `stageName` from the 5-entry `FLAME_STAGE_NAMES` table. No change to `StampConfig`/`StampState`/other branches.

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe("stampStrategy flame variant", ...)` block in `test/lib/engine/stamp.test.ts` (lines 53-137) with:

```ts
describe("stampStrategy flame variant", () => {
  const flameCfg = {
    stamps_required: 10,
    reward_text: "free kopi",
    variant: "flame" as const,
  };

  it("stage 0 (Ember) at 0%", () => {
    const p = stampStrategy.progress(
      { stamp_count: 0, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "flame",
      filled: 0,
      total: 10,
      stage: 0,
      stageName: "Ember",
      totalStages: 5,
    });
  });

  it("stage 1 (Spark) at exactly the 20% threshold", () => {
    const p = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toMatchObject({ stage: 1, stageName: "Spark" });
  });

  it("stage 2 (Small Fire) at exactly the 40% threshold", () => {
    const p = stampStrategy.progress(
      { stamp_count: 4, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toMatchObject({ stage: 2, stageName: "Small Fire" });
  });

  it("stage 3 (Medium Fire) at exactly the 60% threshold", () => {
    const p = stampStrategy.progress(
      { stamp_count: 6, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(p.view).toMatchObject({ stage: 3, stageName: "Medium Fire" });
  });

  it("stage 4 (Full Campfire) at exactly the 80% threshold and at 100%", () => {
    const at80 = stampStrategy.progress(
      { stamp_count: 8, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(at80.view).toMatchObject({ stage: 4, stageName: "Full Campfire" });

    const at100 = stampStrategy.progress(
      { stamp_count: 10, reward_count: 0 },
      flameCfg,
      now,
    );
    expect(at100.view).toMatchObject({ stage: 4, stageName: "Full Campfire" });
  });

  it("rounds thresholds sensibly for an odd stamps_required", () => {
    const oddCfg = { ...flameCfg, stamps_required: 7 };
    // round(7*0.4) = 3 -- below it is still stage 1, at it is stage 2.
    const below = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      oddCfg,
      now,
    );
    expect(below.view).toMatchObject({ stage: 1 });
    const at = stampStrategy.progress(
      { stamp_count: 3, reward_count: 0 },
      oddCfg,
      now,
    );
    expect(at.view).toMatchObject({ stage: 2 });
  });

  it("dots variant (default, no variant field) is unaffected", () => {
    const p = stampStrategy.progress(
      { stamp_count: 3, reward_count: 0 },
      cfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "dots",
      filled: 3,
      total: 5,
      variant: "dots",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run test/lib/engine/stamp.test.ts`
Expected: FAIL — `stage` computed by the old 2-bucket `flameStageFor`/3-entry `FLAME_STAGE_NAMES` doesn't match (e.g. stage 0 test expects `totalStages: 5`, gets `3`).

- [ ] **Step 3: Implement the 5-bucket engine change**

In `src/lib/engine/stamp.ts`, replace:

```ts
const FLAME_STAGE_NAMES = ["Spark", "Inner Flame", "Full Blaze"] as const;

function flameStageFor(filled: number, total: number): number {
  if (filled >= total) return 2;
  if (filled >= Math.round(total * 0.5)) return 1;
  return 0;
}
```

with:

```ts
const FLAME_STAGE_NAMES = [
  "Ember",
  "Spark",
  "Small Fire",
  "Medium Fire",
  "Full Campfire",
] as const;

// Mirrors Plant's stageIndexFor (src/lib/engine/plant.ts) — 5 even buckets
// at 0/20/40/60/80% of `total`; the highest threshold met wins.
function flameStageFor(filled: number, total: number): number {
  let idx = 0;
  for (let i = 0; i < FLAME_STAGE_NAMES.length; i++) {
    const threshold = Math.round((total * i) / FLAME_STAGE_NAMES.length);
    if (filled >= threshold) idx = i;
  }
  return idx;
}
```

Then in the `progress()` method's `flame` branch, change `totalStages: 3` to `totalStages: FLAME_STAGE_NAMES.length`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run test/lib/engine/stamp.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/engine/stamp.ts test/lib/engine/stamp.test.ts
git commit -m "feat(flame): 5-stage flameStageFor, mirrors Plant's bucket pattern"
```

---

### Task 2: Visual — rebuild `FlameLayers` for 5 stages

**Files:**

- Modify: `src/components/flame-layers.tsx`
- Modify: `src/components/flame-layers.dom.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: `stampStrategy.progress()`'s `flame` view (Task 1) — `filled`, `total`, `stage` (0-4), `stageName`.
- Produces: `FlameLayers`'s prop signature is unchanged (`filled`, `total`, `stage`, `stageName`, `className?`) — no call-site changes needed in `src/features/card-check/components/program-card-status.tsx` or `src/app/setup/preview-card.tsx`, since both already pass exactly these four props and the component derives everything else from `stage`.

- [ ] **Step 1: Add the flicker keyframe to globals.css**

In `src/app/globals.css`, inside the `@theme inline { ... }` block, right after the existing `--animate-stamp-pop: stamp-pop 0.4s ease-out;` line, add:

```css
--animate-flame-flicker: flame-flicker 1.8s ease-in-out infinite;
```

Then, right after the existing `@keyframes stamp-pop { ... }` block, add:

```css
@keyframes flame-flicker {
  0%,
  100% {
    transform: scale(1) skewX(0deg);
  }
  25% {
    transform: scale(1.04) skewX(-1.5deg);
  }
  50% {
    transform: scale(0.97) skewX(1deg);
  }
  75% {
    transform: scale(1.02) skewX(-0.5deg);
  }
}
```

This registers `motion-safe:animate-flame-flicker` as a Tailwind utility, the same convention `motion-safe:animate-stamp-pop` already uses in `stamp-dots.tsx` — no separate `prefers-reduced-motion` override block needed, `motion-safe:` already handles it.

- [ ] **Step 2: Write the failing test**

Replace the full contents of `src/components/flame-layers.dom.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlameLayers } from "@/components/flame-layers";

describe("FlameLayers", () => {
  it("renders the Ember stage label with no flame icon", () => {
    const { container } = render(
      <FlameLayers filled={0} total={10} stage={0} stageName="Ember" />,
    );
    expect(screen.getByText("Ember — 0/10")).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("shows a dim coal dot at the Ember stage", () => {
    const { container } = render(
      <FlameLayers filled={0} total={10} stage={0} stageName="Ember" />,
    );
    expect(container.querySelector("[data-flame-coal]")).toBeInTheDocument();
  });

  it("renders a single low-opacity flame icon at the Spark stage", () => {
    const { container } = render(
      <FlameLayers filled={2} total={10} stage={1} stageName="Spark" />,
    );
    const icons = container.querySelectorAll("svg");
    expect(icons).toHaveLength(1);
    expect(icons[0].getAttribute("class")).toContain("text-amber-400/50");
  });

  it("renders three layered flame icons from Small Fire onward", () => {
    const { container } = render(
      <FlameLayers filled={4} total={10} stage={2} stageName="Small Fire" />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(3);
  });

  it("renders the Medium Fire stage label and count", () => {
    render(
      <FlameLayers filled={7} total={10} stage={3} stageName="Medium Fire" />,
    );
    expect(screen.getByText("Medium Fire — 7/10")).toBeInTheDocument();
  });

  it("renders the Full Campfire stage label, 3 flame icons, and a 3rd log", () => {
    const { container } = render(
      <FlameLayers
        filled={10}
        total={10}
        stage={4}
        stageName="Full Campfire"
      />,
    );
    expect(screen.getByText("Full Campfire — 10/10")).toBeInTheDocument();
    expect(container.querySelectorAll("svg")).toHaveLength(3);
    expect(container.querySelectorAll("[data-flame-log]")).toHaveLength(3);
  });

  it("shows only 2 logs before the Full Campfire stage", () => {
    const { container } = render(
      <FlameLayers filled={2} total={10} stage={1} stageName="Spark" />,
    );
    expect(container.querySelectorAll("[data-flame-log]")).toHaveLength(2);
  });

  it("grows the flame icon size across stages", () => {
    const small = render(
      <FlameLayers filled={4} total={10} stage={2} stageName="Small Fire" />,
    );
    const big = render(
      <FlameLayers
        filled={10}
        total={10}
        stage={4}
        stageName="Full Campfire"
      />,
    );
    expect(
      small.container.querySelector("svg")?.getAttribute("class"),
    ).toContain("size-8");
    expect(big.container.querySelector("svg")?.getAttribute("class")).toContain(
      "size-14",
    );
  });

  it("gates the flicker animation on motion-safe and only while a flame is lit", () => {
    const ember = render(
      <FlameLayers filled={0} total={10} stage={0} stageName="Ember" />,
    );
    expect(
      ember.container
        .querySelector("[data-flame-stage]")
        ?.querySelector(".motion-safe\\:animate-flame-flicker"),
    ).not.toBeInTheDocument();

    const spark = render(
      <FlameLayers filled={2} total={10} stage={1} stageName="Spark" />,
    );
    expect(
      spark.container.querySelector(".motion-safe\\:animate-flame-flicker"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm exec vitest run src/components/flame-layers.dom.test.tsx`
Expected: FAIL — current component only renders 2 hardcoded `<Flame>` icons regardless of `stage`, no `data-flame-coal`/`data-flame-log` attributes exist yet.

- [ ] **Step 4: Rebuild the component**

Replace the full contents of `src/components/flame-layers.tsx` with:

```tsx
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const FLAME_COLORS = [
  "text-yellow-400",
  "text-orange-500",
  "text-red-500/85",
] as const;
const FLAME_SIZES = ["", "size-6", "size-8", "size-11", "size-14"] as const;

export function FlameLayers({
  filled,
  total,
  stage,
  stageName,
  className,
}: {
  filled: number;
  total: number;
  stage: number;
  stageName: string;
  className?: string;
}) {
  const iconCount = stage === 0 ? 0 : stage === 1 ? 1 : 3;
  const size = FLAME_SIZES[stage] ?? FLAME_SIZES[1];
  const logCount = stage >= 4 ? 3 : 2;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        data-flame-stage={stage}
        className="flex size-16 flex-col items-center justify-end gap-1 pb-1"
      >
        <div
          className={cn(
            "relative flex size-14 items-center justify-center",
            iconCount > 0 && "motion-safe:animate-flame-flicker",
          )}
        >
          {stage === 0 && (
            <span
              data-flame-coal="true"
              aria-hidden="true"
              className="absolute size-2 rounded-full bg-red-900/70"
            />
          )}
          {Array.from({ length: iconCount }, (_, i) => (
            <Flame
              key={i}
              aria-hidden="true"
              className={cn(
                "absolute",
                size,
                iconCount === 1
                  ? "text-amber-400/50"
                  : FLAME_COLORS[i % FLAME_COLORS.length],
              )}
            />
          ))}
        </div>
        <div aria-hidden="true" className="flex gap-0.5">
          {Array.from({ length: logCount }, (_, i) => (
            <span
              key={i}
              data-flame-log="true"
              className="h-1.5 w-6 rounded-full bg-[oklch(0.35_0.06_50)]"
            />
          ))}
        </div>
      </div>
      <p className="font-mono text-sm font-semibold text-gold-accent">
        {stageName} — {filled}/{total}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/components/flame-layers.dom.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full suite and quality gate**

Run: `pnpm test --run && pnpm check`
Expected: All green — this also re-runs `src/app/setup/preview-card.dom.test.tsx` (which renders a flame view via `PreviewCard`) and `src/features/card-check/components/program-card-status.dom.test.tsx`; neither asserts icon counts, only the stage-name label text, so they should pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/components/flame-layers.tsx src/components/flame-layers.dom.test.tsx src/app/globals.css
git commit -m "feat(flame): redraw FlameLayers for 5 stages (ember, spark, layered fire, woodpile)"
```
