# Preview Animation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Speed up the `/setup` live preview's tick pace, replace the full-browser `ConfettiBurst` celebration with a card-contained `CardBurst` everywhere it's used, fix a genuine rendering bug that makes Scratch Card's preview never animate, and add a per-visit win/lose popup for Wheel and Scratch Card in the preview.

**Architecture:** `TICK_MS` drops from 3000ms to 2000ms in `usePreviewAnimation`. A new `CardBurst` component (adapted from `ConfettiBurst`, `absolute inset-0` instead of `fixed inset-0`) replaces `ConfettiBurst` in both its call sites — the `/setup` preview and the dashboard's `RewardCelebration` redeem dialog — after which `confetti-burst.tsx` is deleted. `preview-card.tsx`'s Scratch Card branch gets the same real `landedId`/`segments` wiring `program-card-status.tsx` (the real customer page) already has, fixing a bug where it was hardcoded to always show unrevealed. `usePreviewAnimation` gains a `lastChanceResult: { won: boolean } | null` field, set directly from `applyVisit`'s own `rewardUnlocked` return on every chance-type tick — for Wheel/Scratch, `rewardUnlocked` already IS the per-visit win/lose signal (chance types have no multi-visit accumulation, so there's nothing to conflate it with), consumed by a self-dismissing popup in `PreviewCard`.

**Tech Stack:** Next.js 16 App Router, React, TypeScript strict, Tailwind v4, Vitest + Testing Library (jsdom), Radix (`AlertDialog`).

## Global Constraints

- Every task's commit leaves `pnpm check` clean, full `pnpm test` passing, and `pnpm build` clean.
- `CELEBRATE_MS` must NOT change — only `TICK_MS` (3000 → 2000).
- The per-visit win/lose signal for chance types (`lastChanceResult`) is the `rewardUnlocked` value `applyVisit` already returns on a chance-type tick — do NOT derive it independently from `total_wins`/`landed_segment_id` diffing. `src/lib/engine/chance.ts`'s `apply()` (lines 66-92) already computes `won = eligible && !!segment.reward_text` per visit, accounting for cooldown/pity correctly, and returns it as `rewardUnlocked` — this genuinely is "did this individual spin win," not gated behind any further multi-visit threshold the way stamp/plant/flame/cup/points' `rewardUnlocked` is. (The approved spec suggested deriving this signal independently to avoid "conflating" it with `rewardUnlocked` — that concern does not apply to chance types specifically; this is a deliberate, verified correction to the spec's literal wording, not a scope change.)
- The real customer-facing `/c` page (`src/app/c/program-card-status.tsx`) must NOT be modified by this plan at all.
- The dashboard's `serve-customer.tsx` redeem logic/flow must NOT change — only the celebration component `RewardCelebration` renders internally (`ConfettiBurst` → `CardBurst`) changes. `serve-customer.tsx` itself needs zero edits, since `RewardCelebration` is a self-contained component with no `serve-customer.tsx`-side positioning dependency.
- `confetti-burst.tsx` (and its dedicated `confetti-fall` CSS keyframe / `.confetti-piece` class in `globals.css`) must not be deleted until BOTH of its consumers (`/setup` preview, `RewardCelebration`) have migrated to `CardBurst` and a repo-wide grep confirms zero remaining references.

---

### Task 1: `CardBurst` component

**Files:**

- Create: `src/components/card-burst.tsx`
- Create: `src/components/card-burst.dom.test.tsx`
- Modify: `src/app/globals.css` (add `card-burst-particle` keyframe + `.card-burst-piece` class + reduced-motion override, additive — does not touch the existing `confetti-fall`/`.confetti-piece` rules, which Task 4 removes once nothing references them)

**Interfaces:**

- Consumes: nothing from other tasks.
- Produces: `CardBurst({ active: boolean }): JSX.Element | null` — a drop-in prop-compatible replacement for `ConfettiBurst`, consumed by Task 3 (`preview-card.tsx`) and Task 4 (`reward-celebration.tsx`). Renders `null` when `active` is `false`. When `active`, renders a `<div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">` containing 24 `<span className="card-burst-piece ...">` particles — critically `absolute`, not `fixed`, so the caller's own `relative`-positioned container clips/contains the burst.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/card-burst.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CardBurst } from "@/components/card-burst";

describe("CardBurst", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(<CardBurst active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders particles contained within the card (absolute, not fixed)", () => {
    const { container } = render(<CardBurst active={true} />);
    const wrapper = container.querySelector('[aria-hidden="true"]');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass("absolute");
    expect(wrapper).not.toHaveClass("fixed");
    expect(container.querySelectorAll(".card-burst-piece")).toHaveLength(24);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/card-burst.dom.test.tsx`
Expected: FAIL — `Cannot find module '@/components/card-burst'`

- [ ] **Step 3: Add the CSS keyframe to `globals.css`**

Add immediately after the existing `.confetti-piece` block (around line 182), before the `@media (prefers-reduced-motion: no-preference)` block:

```css
@keyframes card-burst-particle {
  0% {
    transform: translate(-50%, -50%) rotate(var(--burst-angle)) translateX(0)
      scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) rotate(var(--burst-angle))
      translateX(var(--burst-distance)) scale(0.4);
    opacity: 0;
  }
}
.card-burst-piece {
  animation-name: card-burst-particle;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}
```

Add to the existing `@media (prefers-reduced-motion: reduce)` block (around line 194), alongside the existing `.confetti-piece` rule:

```css
.card-burst-piece {
  animation: none;
  opacity: 0;
}
```

- [ ] **Step 4: Write the component**

```tsx
// src/components/card-burst.tsx
"use client";

import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const COLORS = [
  "bg-gold",
  "bg-primary",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-rose-500",
];

type Piece = {
  id: number;
  angle: number;
  distance: number;
  delay: number;
  duration: number;
  color: string;
};

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: Math.random() * 360,
    distance: 40 + Math.random() * 50,
    delay: Math.random() * 0.15,
    duration: 0.6 + Math.random() * 0.4,
    color: COLORS[i % COLORS.length],
  }));
}

// Fireworks-style burst contained to whatever relative-positioned box the
// caller wraps it in (unlike the deleted ConfettiBurst, which was
// `fixed inset-0` and covered the entire viewport regardless of where it
// was mounted). Particles radiate outward from the container's center.
export function CardBurst({ active }: { active: boolean }) {
  const pieces = useMemo(() => (active ? makePieces(24) : []), [active]);

  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className={cn(
            "card-burst-piece absolute top-1/2 left-1/2 size-2 rounded-sm",
            p.color,
          )}
          style={
            {
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--burst-angle": `${p.angle}deg`,
              "--burst-distance": `${p.distance}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/components/card-burst.dom.test.tsx`
Expected: PASS (2/2)

- [ ] **Step 6: Run full suite, check, build**

Run: `pnpm test && pnpm check && pnpm build`
Expected: all pass/clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/card-burst.tsx src/components/card-burst.dom.test.tsx src/app/globals.css
git commit -m "feat: add CardBurst, a card-contained celebration burst"
```

---

### Task 2: Speed up ticks, add per-visit chance result

**Files:**

- Modify: `src/app/setup/preview-animation.ts`
- Modify: `src/app/setup/preview-animation.dom.test.tsx`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `usePreviewAnimation(input: PreviewInput): { progress: Progress; celebrating: boolean; lastChanceResult: { won: boolean } | null }` — `lastChanceResult` is `null` for every non-chance program type and under `prefers-reduced-motion`; for `type: "wheel" | "scratch"`, it's set to `{ won: rewardUnlocked }` on every ticking-phase timeout, using the same `rewardUnlocked` value the effect already computes from `applyVisit`. Consumed by Task 3 (`preview-card.tsx`, `setup-form.tsx`).

- [ ] **Step 1: Update the existing test file's tick-timing advances**

In `src/app/setup/preview-animation.dom.test.tsx`, every `vi.advanceTimersByTime(3000)` call that represents a TICK (not the celebrate pause) changes to `2000`. The celebrate-phase advances (`vi.advanceTimersByTime(2000)`, already 2000ms, representing `CELEBRATE_MS`) stay unchanged. Specifically:

- Line 48 (`"ticks the stamp count up every 3 seconds"` test, 1st tick): `3000` → `2000`
- Line 53 (same test, 2nd tick): `3000` → `2000`
- Line 64 (`"celebrates on completion..."` test, 1st tick): `3000` → `2000`
- Line 70 (same test, 2nd tick): `3000` → `2000`
- Line 76 (same test, celebrate pause): stays `2000` (already `CELEBRATE_MS`, unchanged)
- Line 94 (`"resets to the head-start position..."` test, tick): `3000` → `2000`
- Line 100 (same test, celebrate pause): stays `2000`
- Line 112 (`"restarts immediately..."` test, tick): `3000` → `2000`
- Line 132 (`"lucky can win..."` test, tick): `3000` → `2000`
- Line 149 (`"wheel can land on a non-reward segment..."` test, tick): `3000` → `2000`
- Line 164 (`"falls back to a static... snapshot"` test, arbitrary 10000ms probe): leave as-is, unaffected.

Also rename the test titled `"ticks the stamp count up every 3 seconds"` (line 41) to `"ticks the stamp count up every 2 seconds"` since it now asserts the new pace.

- [ ] **Step 2: Add new failing tests for `lastChanceResult`**

Append to the same file, before the final closing `});`:

```tsx
it("sets lastChanceResult when a wheel spin wins", () => {
  const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { result } = renderHook(() =>
    usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
  );

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(result.current.lastChanceResult).toEqual({ won: true });
  rollSpy.mockRestore();
});

it("sets lastChanceResult when a wheel spin loses", () => {
  const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
  const { result } = renderHook(() =>
    usePreviewAnimation({ ...base, type: "wheel", pityCeiling: undefined }),
  );

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(result.current.lastChanceResult).toEqual({ won: false });
  rollSpy.mockRestore();
});

it("sets lastChanceResult for scratch the same way as wheel", () => {
  const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { result } = renderHook(() =>
    usePreviewAnimation({
      ...base,
      type: "scratch",
      pityCeiling: undefined,
    }),
  );

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(result.current.lastChanceResult).toEqual({ won: true });
  rollSpy.mockRestore();
});

it("never sets lastChanceResult for non-chance types", () => {
  const { result } = renderHook(() =>
    usePreviewAnimation({ ...base, type: "stamp" }),
  );

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(result.current.lastChanceResult).toBeNull();
});

it("resets lastChanceResult to null when the recipe changes", () => {
  const rollSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
  const { result, rerender } = renderHook(
    (props: PreviewInput) => usePreviewAnimation(props),
    {
      initialProps: {
        ...base,
        type: "wheel" as const,
        pityCeiling: undefined,
      },
    },
  );

  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(result.current.lastChanceResult).toEqual({ won: true });

  rerender({
    ...base,
    type: "wheel",
    pityCeiling: undefined,
    name: "New name",
  });
  expect(result.current.lastChanceResult).toBeNull();
  rollSpy.mockRestore();
});
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `pnpm vitest run src/app/setup/preview-animation.dom.test.tsx`
Expected: FAIL — `result.current.lastChanceResult` is `undefined`, not matching `{ won: true }`/`null`.

- [ ] **Step 4: Update `preview-animation.ts`**

Change `TICK_MS`:

```ts
const TICK_MS = 2000;
```

Add `lastChanceResult` state, declared alongside `phase`:

```ts
const [phase, setPhase] = useState<"ticking" | "celebrating">("ticking");
const [lastChanceResult, setLastChanceResult] = useState<{
  won: boolean;
} | null>(null);
```

Add the reset in the recipe-change effect:

```ts
useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setCard(initialCard);
  setSimulatedNow(new Date());
  setPhase("ticking");
  setLastChanceResult(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [recipeKey]);
```

Set it inside the ticking-timeout branch, and add `type` to the effect's dependency array:

```ts
useEffect(() => {
  if (reducedMotion) return;
  const delay = phase === "celebrating" ? CELEBRATE_MS : TICK_MS;
  const timer = setTimeout(() => {
    if (phase === "celebrating") {
      setCard(initialCard);
      setSimulatedNow(new Date());
      setPhase("ticking");
      return;
    }
    const nextNow = new Date();
    const event: EngineEvent = {
      kind: "visit",
      payload: { roll: Math.random() },
    };
    const { state, rewardUnlocked } = applyVisit(program, card, event, nextNow);
    setCard({ ...card, state });
    setSimulatedNow(nextNow);
    if (type === "wheel" || type === "scratch") {
      setLastChanceResult({ won: rewardUnlocked });
    }
    if (rewardUnlocked) setPhase("celebrating");
  }, delay);
  return () => clearTimeout(timer);
}, [reducedMotion, phase, card, simulatedNow, program, initialCard, type]);
```

Update the return type and both return statements:

```ts
export function usePreviewAnimation(input: PreviewInput): {
  progress: Progress;
  celebrating: boolean;
  lastChanceResult: { won: boolean } | null;
} {
```

```ts
if (reducedMotion) {
  return {
    progress: buildPreviewProgress(input),
    celebrating: false,
    lastChanceResult: null,
  };
}

return {
  progress: getProgress(program, card, simulatedNow),
  celebrating: phase === "celebrating",
  lastChanceResult,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/app/setup/preview-animation.dom.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 6: Run full suite, check, build**

Run: `pnpm test && pnpm check && pnpm build`
Expected: all pass/clean. (`setup-form.tsx` still calls `usePreviewAnimation` and destructures only `progress`/`celebrating` today — adding a field to the return type is additive and does not break that call site; Task 3 wires up the new field.)

- [ ] **Step 7: Commit**

```bash
git add src/app/setup/preview-animation.ts src/app/setup/preview-animation.dom.test.tsx
git commit -m "feat: speed up preview ticks to 2s, add per-visit chance result"
```

---

### Task 3: Wire `CardBurst`, fix Scratch Card, add win/lose popup

**Files:**

- Modify: `src/app/setup/preview-card.tsx`
- Modify: `src/app/setup/preview-card.dom.test.tsx`
- Modify: `src/app/setup/setup-form.tsx`

**Interfaces:**

- Consumes: `CardBurst` (Task 1), `usePreviewAnimation`'s `lastChanceResult` field (Task 2).
- Produces: `PreviewCard`'s props gain `celebrating?: boolean` (default `false`) and `lastChanceResult?: { won: boolean } | null` (default `null`) — both optional so every existing call site/test that doesn't pass them keeps working unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/setup/preview-card.dom.test.tsx`, before the final closing `});`:

```tsx
it("reveals the scratch card result from the real engine view, not a hardcoded placeholder", () => {
  const progress: Progress = {
    stage: "play",
    label: "Scratch to reveal",
    view: {
      kind: "chance",
      variant: "scratch",
      segments: [
        { id: "a", label: "Try again", reward: false },
        { id: "b", label: "Free item", reward: true },
      ],
      landedId: "b",
    },
    rewardReady: false,
  };
  render(
    <PreviewCard
      progress={progress}
      name="Scratch to win"
      rewardText="Free item"
    />,
  );
  expect(screen.getByText("Free item")).toBeInTheDocument();
});

it("renders a card burst overlay when celebrating", () => {
  const progress: Progress = {
    stage: "collecting",
    label: "2/2 stamps",
    view: { kind: "dots", filled: 2, total: 2 },
    rewardReady: true,
  };
  const { container } = render(
    <PreviewCard
      progress={progress}
      name="Coffee card"
      rewardText="Free kopi"
      celebrating={true}
    />,
  );
  expect(
    container.querySelectorAll(".card-burst-piece").length,
  ).toBeGreaterThan(0);
});

it("does not render a card burst overlay when not celebrating", () => {
  const progress: Progress = {
    stage: "collecting",
    label: "1/2 stamps",
    view: { kind: "dots", filled: 1, total: 2 },
    rewardReady: false,
  };
  const { container } = render(
    <PreviewCard
      progress={progress}
      name="Coffee card"
      rewardText="Free kopi"
    />,
  );
  expect(container.querySelectorAll(".card-burst-piece")).toHaveLength(0);
});

it("shows a win popup for a chance result that won", () => {
  const progress: Progress = {
    stage: "play",
    label: "Spin to play",
    view: {
      kind: "chance",
      variant: "wheel",
      segments: [{ id: "a", label: "Free item", reward: true }],
      landedId: "a",
    },
    rewardReady: false,
  };
  render(
    <PreviewCard
      progress={progress}
      name="Spin to win"
      rewardText="Free item"
      lastChanceResult={{ won: true }}
    />,
  );
  expect(screen.getByText("🎉 You won!")).toBeInTheDocument();
});

it("shows a lose popup for a chance result that lost", () => {
  const progress: Progress = {
    stage: "play",
    label: "Spin to play",
    view: {
      kind: "chance",
      variant: "wheel",
      segments: [{ id: "a", label: "Try again", reward: false }],
      landedId: "a",
    },
    rewardReady: false,
  };
  render(
    <PreviewCard
      progress={progress}
      name="Spin to win"
      rewardText="Free item"
      lastChanceResult={{ won: false }}
    />,
  );
  expect(screen.getByText("Try again")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/app/setup/preview-card.dom.test.tsx`
Expected: FAIL — the scratch reveal test fails because `preview-card.tsx` currently hardcodes `revealed={false}`; the burst/popup tests fail because those props/renders don't exist yet.

- [ ] **Step 3: Rewrite `preview-card.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Progress } from "@/lib/engine/types";
import { Plant } from "@/components/plant";
import { Cup } from "@/components/cup";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { FlameLayers } from "@/components/flame-layers";
import { StampDots } from "@/components/stamp-dots";
import { PointsBar } from "@/components/points-bar";
import { CardBurst } from "@/components/card-burst";
import { cn } from "@/lib/utils";

const CHANCE_RESULT_VISIBLE_MS = 1500;

// Mirrors ProgramCardStatus's view-kind switch (src/app/c/program-card-status.tsx)
// — same components, same props — so the /setup preview can never visually
// drift from a real customer card. No redeem/regenerate interactivity —
// this is a static snapshot of the current form values, not a live card.
//
// Unlike ProgramCardStatus, every visual sits in one fixed-height, centered
// box (h-36) here: switching card type in /setup shouldn't make the preview
// panel jump around in height between a wide stamp grid, a square plant/
// wheel, or a compact flame layer.
export function PreviewCard({
  progress,
  name,
  rewardText,
  celebrating = false,
  lastChanceResult = null,
}: {
  progress: Progress;
  name: string;
  rewardText: string;
  celebrating?: boolean;
  lastChanceResult?: { won: boolean } | null;
}) {
  const view = progress.view;

  const [showChanceResult, setShowChanceResult] = useState(false);
  useEffect(() => {
    if (!lastChanceResult) return;
    setShowChanceResult(true);
    const timer = setTimeout(
      () => setShowChanceResult(false),
      CHANCE_RESULT_VISIBLE_MS,
    );
    return () => clearTimeout(timer);
  }, [lastChanceResult]);

  return (
    <div className="relative space-y-4 rounded-xl border bg-muted/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Customer preview
      </p>
      <p className="text-sm font-semibold">{name || "Your card"}</p>
      <div className="flex h-36 items-center justify-center">
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
          <FlameLayers
            filled={view.filled}
            total={view.total}
            stage={view.stage}
            stageName={view.stageName}
          />
        ) : view.kind === "chance" ? (
          view.variant === "wheel" ? (
            <Wheel segments={view.segments} landedId={view.landedId} />
          ) : (
            <ScratchCard
              revealed={view.landedId !== null}
              label={
                view.segments.find((s) => s.id === view.landedId)?.label ?? ""
              }
              reward={
                view.segments.find((s) => s.id === view.landedId)?.reward ??
                false
              }
            />
          )
        ) : view.kind === "dots" ? (
          view.variant === "points" ? (
            <PointsBar filled={view.filled} total={view.total} />
          ) : (
            <StampDots filled={view.filled} total={view.total} />
          )
        ) : null}
      </div>
      <p className="font-mono text-sm font-medium">{progress.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {rewardText || "—"}
      </p>
      <CardBurst active={celebrating} />
      {view.kind === "chance" && lastChanceResult && showChanceResult && (
        <div
          className={cn(
            "absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-semibold shadow-sm",
            lastChanceResult.won
              ? "bg-gold text-gold-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {lastChanceResult.won ? "🎉 You won!" : "Try again"}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire `setup-form.tsx`**

Remove the `ConfettiBurst` import:

```diff
-import { ConfettiBurst } from "@/components/confetti-burst";
```

Destructure `lastChanceResult` from the hook call:

```ts
const {
  progress: previewProgress,
  celebrating,
  lastChanceResult,
} = usePreviewAnimation({
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  segments,
  headStart,
  headStartPercent,
  variant,
  pointsPerVisit,
});
```

Replace the `PreviewCard`/`ConfettiBurst` JSX pair:

```tsx
<PreviewCard
  progress={previewProgress}
  name={name}
  rewardText={rewardText}
  celebrating={celebrating}
  lastChanceResult={lastChanceResult}
/>
```

(the standalone `<ConfettiBurst active={celebrating} />` line is deleted — the burst now renders inside `PreviewCard` itself.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run src/app/setup/preview-card.dom.test.tsx src/app/setup/setup-form.dom.test.tsx`
Expected: PASS (all tests, including the 7 pre-existing `PreviewCard` tests, which pass unmodified since the new props are optional).

- [ ] **Step 6: Run full suite, check, build**

Run: `pnpm test && pnpm check && pnpm build`
Expected: all pass/clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/setup/preview-card.tsx src/app/setup/preview-card.dom.test.tsx src/app/setup/setup-form.tsx
git commit -m "fix: wire CardBurst and real scratch-card data into the preview, add win/lose popup"
```

---

### Task 4: Migrate `RewardCelebration`, delete `ConfettiBurst`, final sweep

**Files:**

- Modify: `src/components/reward-celebration.tsx`
- Create: `src/components/reward-celebration.dom.test.tsx`
- Delete: `src/components/confetti-burst.tsx`
- Modify: `src/app/globals.css` (remove the now-unused `confetti-fall` keyframe, `.confetti-piece` class, and its reduced-motion override)
- Modify: `README.md` (mention `card-burst` in place of `confetti-burst` in the components file-layout line, if such a line exists)

**Interfaces:**

- Consumes: `CardBurst` (Task 1).
- Produces: nothing later tasks depend on — this is the final task.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/reward-celebration.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RewardCelebration } from "@/components/reward-celebration";

describe("RewardCelebration", () => {
  it("renders a card-burst overlay contained in the dialog when open", async () => {
    render(
      <RewardCelebration
        open={true}
        phone="+65 9123 4567"
        rewardText="Free kopi"
        onOpenChange={() => {}}
      />,
    );
    // AlertDialog content is portal-rendered to document.body — query via
    // screen, not the local render() container.
    expect(await screen.findByText("🎉 Reward unlocked!")).toBeInTheDocument();
    expect(
      document.querySelectorAll(".card-burst-piece").length,
    ).toBeGreaterThan(0);
  });

  it("renders no dialog content when closed", () => {
    render(
      <RewardCelebration
        open={false}
        phone="+65 9123 4567"
        rewardText="Free kopi"
        onOpenChange={() => {}}
      />,
    );
    expect(screen.queryByText("🎉 Reward unlocked!")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".card-burst-piece")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/reward-celebration.dom.test.tsx`
Expected: FAIL — `card-burst-piece` elements don't exist yet (component still renders `ConfettiBurst`, which uses the `confetti-piece` class).

- [ ] **Step 3: Rewrite `reward-celebration.tsx`**

```tsx
"use client";

import { CardBurst } from "@/components/card-burst";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function RewardCelebration({
  open,
  phone,
  rewardText,
  onOpenChange,
}: {
  open: boolean;
  phone: string;
  rewardText: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="overflow-hidden">
        <CardBurst active={open} />
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center text-2xl">
            🎉 Reward unlocked!
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {phone} just earned {rewardText}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Nice!
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Note: `className="overflow-hidden"` is required on `AlertDialogContent` — its base styling (`src/components/ui/alert-dialog.tsx`) does not include `overflow-hidden` by default, and without it the burst's particles would visually spill past the dialog's rounded corners instead of being clipped to the box.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/reward-celebration.dom.test.tsx`
Expected: PASS (2/2)

- [ ] **Step 5: Grep-verify `ConfettiBurst` has zero remaining consumers**

Run: `grep -rn "ConfettiBurst\|confetti-burst" src/ --include="*.ts" --include="*.tsx"`
Expected: zero matches (Task 3 already removed the `/setup` preview's usage; this step's own rewrite just removed `RewardCelebration`'s).

- [ ] **Step 6: Delete `confetti-burst.tsx`**

```bash
rm src/components/confetti-burst.tsx
```

- [ ] **Step 7: Remove the now-dead CSS from `globals.css`**

Delete the `confetti-fall` keyframe and `.confetti-piece` class (originally around lines 168-182):

```diff
-@keyframes confetti-fall {
-  0% {
-    transform: translateY(-10%) rotate(0deg);
-    opacity: 1;
-  }
-  100% {
-    transform: translateY(420%) rotate(360deg);
-    opacity: 0;
-  }
-}
-.confetti-piece {
-  animation-name: confetti-fall;
-  animation-timing-function: ease-in;
-  animation-fill-mode: forwards;
-}
```

Delete the `.confetti-piece` reduced-motion override (originally around line 194), keeping the `.card-burst-piece` one from Task 1 and the other unrelated rules in that block:

```diff
-  .confetti-piece {
-    animation: none;
-    opacity: 0;
-  }
```

- [ ] **Step 8: Check README for a stale `confetti-burst` reference**

Run: `grep -n "confetti-burst\|confetti_burst" README.md`

If a hit exists in a components file-layout listing, update it to `card-burst` in the same commit. If no hit exists, skip this step — no placeholder edit needed.

- [ ] **Step 9: Final grep-verify sweep**

Run: `grep -rin "confetti" . --include="*.ts" --include="*.tsx" --include="*.css" --include="*.md" | grep -v node_modules | grep -v "docs/superpowers"`

Expected: zero matches outside `docs/superpowers/specs`/`docs/superpowers/plans` (this plan/spec's own historical text) and `.superpowers/sdd/progress.md`'s ledger. If any other hit appears, it's a real gap — fix it before finishing.

- [ ] **Step 10: Run full suite, check, build**

Run: `pnpm test && pnpm check && pnpm build`
Expected: all pass/clean.

- [ ] **Step 11: Commit**

```bash
git add src/components/reward-celebration.tsx src/components/reward-celebration.dom.test.tsx src/app/globals.css
git rm src/components/confetti-burst.tsx
git add README.md   # only if Step 8 found and fixed a stale reference
git commit -m "refactor: migrate RewardCelebration to CardBurst, delete ConfettiBurst"
```
