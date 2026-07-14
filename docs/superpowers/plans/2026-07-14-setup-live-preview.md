# Live loyalty card preview on /setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give vendors a live, side-by-side preview on `/setup` of exactly what their customer-facing loyalty card looks like, updating on every keystroke.

**Architecture:** A new pure module (`preview-state.ts`) assembles a synthetic `ProgramLike`/`CardLike` from the form's current field values and calls the real `getProgress()` (`src/lib/engine/index.ts`) — the same function the actual `/c` customer page uses — so the preview can never visually drift from a real card. A new `PreviewCard` component renders the resulting `Progress` through the same per-type visual switch `ProgramCardStatus` already uses. `SetupForm`'s currently-uncontrolled text/number fields become controlled state so the preview can react on every keystroke; the existing `key={prefillGeneration}` remount hack is removed as part of that conversion.

**Tech Stack:** Next.js 16 App Router, React (client component, `useState`), TypeScript strict, Vitest + Testing Library (jsdom for components, plain node tests for pure logic).

## Global Constraints

- The preview must be computed via the real `getProgress()` (`src/lib/engine/index.ts`) — never reimplement per-type view/progress logic in the preview module.
- Head-start seeding in the preview must exactly mirror `enroll_card`'s SQL formula (`supabase/migrations/0014_loopkit_head_start.sql`): stamp seed `max(1, round(stampsRequired * 0.2))` capped at `stampsRequired - 1`; plant growth `min(max(seed, round(visitsToBloom * 0.25)), visitsToBloom - 1)`; streak `current_streak = 1` (one full banked period), `reward_banked = false`.
- The head-start toggle only affects the stamp/plant/streak previews — lucky/wheel/scratch always preview at the fresh/zero/unplayed state, regardless of the toggle's value (they never render the toggle in the UI either, unchanged).
- The preview updates live, on every keystroke — no debounce, no manual "Preview" button.
- Placement: a two-column `grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start` — form column first, preview column second, stacking on mobile/tablet below `lg`.
- Keep the codebase clean: the `key={prefillGeneration}` remount hack and the `prefill`/`prefillGeneration` variables in `setup-form.tsx` are removed entirely once the fields they served become controlled — no dead code left behind.
- Every task's commit must leave `pnpm check` clean and the full `pnpm test` suite passing.
- Applies uniformly to every flow `SetupForm` already serves (create, edit, migrate/change-type, prep) — no special-casing.

---

### Task 1: Preview state computation (`preview-state.ts`)

**Files:**

- Create: `src/app/setup/preview-state.ts`
- Test: `test/app/preview-state.test.ts`

**Interfaces:**

- Consumes: `ProgramType` (`@/lib/program`); `buildPlantConfig`, `buildChanceConfig`, `buildStreakConfig` (`@/lib/program`); `getProgress`, `ProgramLike`, `CardLike` (`@/lib/engine`); `Progress` (`@/lib/engine/types`).
- Produces: `buildPreviewProgress(input: PreviewInput): Progress`, where

  ```ts
  export type PreviewInput = {
    type: ProgramType;
    name: string;
    rewardText: string;
    stampsRequired: number;
    visitsToBloom: number;
    winPercent: number;
    pityCeiling: number | undefined;
    periodDays: number;
    targetStreak: number;
    segments: { label: string; weight: number; is_reward: boolean }[];
    headStart: boolean;
  };
  ```

  Task 2 (`PreviewCard`) consumes only the returned `Progress` — it never imports `preview-state.ts` directly. Task 3 (`setup-form.tsx`) imports `buildPreviewProgress` and `PreviewInput`'s field names directly.

- [ ] **Step 1: Write the failing test**

Create `test/app/preview-state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildPreviewProgress } from "@/app/setup/preview-state";

const base = {
  name: "Coffee card",
  rewardText: "Free kopi",
  stampsRequired: 10,
  visitsToBloom: 6,
  winPercent: 20,
  pityCeiling: 8 as number | undefined,
  periodDays: 7,
  targetStreak: 4,
  segments: [
    { label: "Try again", weight: 5, is_reward: false },
    { label: "Free item", weight: 1, is_reward: true },
  ],
  headStart: false,
};

describe("buildPreviewProgress", () => {
  it("stamp: fresh card shows zero-filled dots", () => {
    const progress = buildPreviewProgress({ ...base, type: "stamp" });
    expect(progress.label).toBe("0/10 stamps");
    expect(progress.view).toEqual({ kind: "dots", filled: 0, total: 10 });
  });

  it("stamp: head start seeds ~20% of stamps_required, capped below the requirement", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "stamp",
      headStart: true,
    });
    expect(progress.label).toBe("2/10 stamps");
    expect(progress.view).toEqual({ kind: "dots", filled: 2, total: 10 });
  });

  it("plant: fresh card starts at Seed", () => {
    const progress = buildPreviewProgress({ ...base, type: "plant" });
    expect(progress.view).toEqual({
      kind: "plant",
      stage: 0,
      stageName: "Seed",
      totalStages: 5,
      wilting: false,
    });
  });

  it("plant: head start floors growth at the Sprout stage", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "plant",
      headStart: true,
    });
    expect(progress.view).toEqual({
      kind: "plant",
      stage: 1,
      stageName: "Sprout",
      totalStages: 5,
      wilting: false,
    });
  });

  it("streak: fresh card has no active window", () => {
    const progress = buildPreviewProgress({ ...base, type: "streak" });
    expect(progress.view).toEqual({
      kind: "streak",
      current: 0,
      target: 4,
      status: "none",
    });
  });

  it("streak: head start banks one full period", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "streak",
      headStart: true,
    });
    expect(progress.view).toEqual({
      kind: "streak",
      current: 1,
      target: 4,
      status: "active",
    });
  });

  it("lucky: always previews at the zero/unplayed state, ignoring head start", () => {
    const fresh = buildPreviewProgress({ ...base, type: "lucky" });
    const withHeadStart = buildPreviewProgress({
      ...base,
      type: "lucky",
      headStart: true,
    });
    expect(fresh.view).toEqual({ kind: "dots", filled: 0, total: 8 });
    expect(withHeadStart.view).toEqual(fresh.view);
  });

  it("wheel: renders the configured segments at the zero/unplayed state", () => {
    const progress = buildPreviewProgress({
      ...base,
      type: "wheel",
      pityCeiling: undefined,
    });
    expect(progress.view.kind).toBe("chance");
    if (progress.view.kind !== "chance") {
      throw new Error("expected a chance view");
    }
    expect(progress.view.variant).toBe("wheel");
    expect(progress.view.landedId).toBeNull();
    expect(
      progress.view.segments.map((s) => ({ label: s.label, reward: s.reward })),
    ).toEqual([
      { label: "Try again", reward: false },
      { label: "Free item", reward: true },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run test/app/preview-state.test.ts`
Expected: FAIL — `Cannot find module '@/app/setup/preview-state'`.

- [ ] **Step 3: Implement `preview-state.ts`**

Create `src/app/setup/preview-state.ts`:

```ts
import {
  buildChanceConfig,
  buildPlantConfig,
  buildStreakConfig,
  type ProgramType,
} from "@/lib/program";
import { getProgress, type CardLike, type ProgramLike } from "@/lib/engine";
import type { Progress } from "@/lib/engine/types";

export type PreviewInput = {
  type: ProgramType;
  name: string;
  rewardText: string;
  stampsRequired: number;
  visitsToBloom: number;
  winPercent: number;
  pityCeiling: number | undefined;
  periodDays: number;
  targetStreak: number;
  segments: { label: string; weight: number; is_reward: boolean }[];
  headStart: boolean;
};

// Mirrors enroll_card's seed math (supabase/migrations/0014_loopkit_head_start.sql)
// exactly, so the preview never shows a head start that the real card wouldn't.
function headStartStampSeed(stampsRequired: number): number {
  const seed = Math.max(1, Math.round(stampsRequired * 0.2));
  return Math.min(seed, stampsRequired - 1);
}

function headStartPlantGrowth(visitsToBloom: number): number {
  const seed = Math.max(1, Math.round(visitsToBloom * 0.2));
  const floored = Math.max(seed, Math.round(visitsToBloom * 0.25));
  return Math.min(floored, visitsToBloom - 1);
}

const FRESH_CARD: CardLike = { state: {}, stamp_count: 0, reward_count: 0 };

// Assembles a synthetic program+card from the form's current field values and
// calls the real getProgress() — the same function src/app/c's customer page
// uses — so the preview can never drift from what a real card renders.
export function buildPreviewProgress(input: PreviewInput): Progress {
  const now = new Date();

  if (input.type === "stamp") {
    const program: ProgramLike = {
      type: "stamp",
      stamps_required: input.stampsRequired,
      reward_text: input.rewardText,
      config: {
        stamps_required: input.stampsRequired,
        reward_text: input.rewardText,
      },
    };
    const card: CardLike = input.headStart
      ? {
          state: {},
          stamp_count: headStartStampSeed(input.stampsRequired),
          reward_count: 0,
        }
      : FRESH_CARD;
    return getProgress(program, card, now);
  }

  if (input.type === "plant") {
    const config = buildPlantConfig(input.visitsToBloom, input.rewardText);
    const program: ProgramLike = {
      type: "plant",
      stamps_required: input.visitsToBloom,
      reward_text: input.rewardText,
      config,
    };
    const card: CardLike = input.headStart
      ? {
          state: {
            growth: headStartPlantGrowth(input.visitsToBloom),
            last_visit_at: now.toISOString(),
            blooms: 0,
            bloomed: false,
          },
          stamp_count: 0,
          reward_count: 0,
        }
      : FRESH_CARD;
    return getProgress(program, card, now);
  }

  if (input.type === "streak") {
    const config = buildStreakConfig(
      input.periodDays,
      input.targetStreak,
      input.rewardText,
    );
    const program: ProgramLike = {
      type: "streak",
      stamps_required: input.targetStreak,
      reward_text: input.rewardText,
      config,
    };
    const card: CardLike = input.headStart
      ? {
          state: {
            current_streak: 1,
            window_start: now.toISOString(),
            reward_banked: false,
          },
          stamp_count: 0,
          reward_count: 0,
        }
      : FRESH_CARD;
    return getProgress(program, card, now);
  }

  if (input.type === "lucky") {
    const pityCeiling = input.pityCeiling ?? 8;
    const program: ProgramLike = {
      type: "lucky",
      stamps_required: pityCeiling,
      reward_text: input.rewardText,
      config: {
        win_probability: input.winPercent / 100,
        pity_ceiling: pityCeiling,
        cooldown_visits: 0,
        reward_text: input.rewardText,
      },
    };
    return getProgress(program, FRESH_CARD, now);
  }

  // wheel / scratch — never offer head start, always the zero/unplayed state.
  const config = buildChanceConfig(
    input.type,
    input.segments,
    input.pityCeiling,
    input.rewardText,
  );
  const program: ProgramLike = {
    type: input.type,
    stamps_required: input.pityCeiling ?? 10,
    reward_text: input.rewardText,
    config,
  };
  return getProgress(program, FRESH_CARD, now);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run test/app/preview-state.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/setup/preview-state.ts test/app/preview-state.test.ts
git commit -m "feat: pure preview-state computation for /setup live preview"
```

---

### Task 2: `PreviewCard` component

**Files:**

- Create: `src/app/setup/preview-card.tsx`
- Test: `src/app/setup/preview-card.dom.test.tsx`

**Interfaces:**

- Consumes: `Progress` (`@/lib/engine/types`, produced by Task 1's `buildPreviewProgress`); `Plant`, `Wheel`, `ScratchCard`, `StreakFlame`, `StampDots` (`@/components/*`, all pre-existing, unmodified).
- Produces: `PreviewCard({ progress, name, rewardText }: { progress: Progress; name: string; rewardText: string })` — a JSX component. Task 3 renders this directly.

- [ ] **Step 1: Write the failing test**

Create `src/app/setup/preview-card.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreviewCard } from "@/app/setup/preview-card";
import type { Progress } from "@/lib/engine/types";

describe("PreviewCard", () => {
  it("renders the name, reward text, and label", () => {
    const progress: Progress = {
      stage: "collecting",
      label: "2/10 stamps",
      view: { kind: "dots", filled: 2, total: 10 },
      rewardReady: false,
    };
    render(
      <PreviewCard
        progress={progress}
        name="Coffee card"
        rewardText="Free kopi"
      />,
    );
    expect(screen.getByText("Coffee card")).toBeInTheDocument();
    expect(screen.getByText("2/10 stamps")).toBeInTheDocument();
    expect(screen.getByText("Reward: Free kopi")).toBeInTheDocument();
  });

  it("renders the plant visual for a plant view", () => {
    const progress: Progress = {
      stage: "Sprout",
      label: "Sprout",
      view: {
        kind: "plant",
        stage: 1,
        stageName: "Sprout",
        totalStages: 5,
        wilting: false,
      },
      rewardReady: false,
    };
    const { container } = render(
      <PreviewCard
        progress={progress}
        name="Grow-a-kopi"
        rewardText="Free kopi"
      />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("Sprout")).toBeInTheDocument();
  });

  it("renders the streak flame for a streak view", () => {
    const progress: Progress = {
      stage: "active",
      label: "Streak active — visit again to keep it",
      view: { kind: "streak", current: 1, target: 4, status: "active" },
      rewardReady: false,
    };
    render(
      <PreviewCard
        progress={progress}
        name="Weekly regular"
        rewardText="Free item"
      />,
    );
    expect(screen.getByText("1 / 4 week streak")).toBeInTheDocument();
  });

  it("renders the wheel for a chance view with variant wheel", () => {
    const progress: Progress = {
      stage: "play",
      label: "Spin to play",
      view: {
        kind: "chance",
        variant: "wheel",
        segments: [
          { id: "a", label: "Try again", reward: false },
          { id: "b", label: "Free item", reward: true },
        ],
        landedId: null,
      },
      rewardReady: false,
    };
    const { container } = render(
      <PreviewCard
        progress={progress}
        name="Spin to win"
        rewardText="Free item"
      />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("falls back to placeholder name and reward text when both are blank", () => {
    const progress: Progress = {
      stage: "collecting",
      label: "0/10 stamps",
      view: { kind: "dots", filled: 0, total: 10 },
      rewardReady: false,
    };
    render(<PreviewCard progress={progress} name="" rewardText="" />);
    expect(screen.getByText("Your card")).toBeInTheDocument();
    expect(screen.getByText("Reward: —")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/app/setup/preview-card.dom.test.tsx`
Expected: FAIL — `Cannot find module '@/app/setup/preview-card'`.

- [ ] **Step 3: Implement `preview-card.tsx`**

Create `src/app/setup/preview-card.tsx`:

```tsx
import type { Progress } from "@/lib/engine/types";
import { Plant } from "@/components/plant";
import { Wheel } from "@/components/wheel";
import { ScratchCard } from "@/components/scratch-card";
import { StreakFlame } from "@/components/streak-flame";
import { StampDots } from "@/components/stamp-dots";

// Mirrors ProgramCardStatus's view-kind switch (src/app/c/program-card-status.tsx)
// exactly, so the /setup preview can never visually drift from a real
// customer card. No redeem/regenerate interactivity — this is a static
// snapshot of the current form values, not a live card.
export function PreviewCard({
  progress,
  name,
  rewardText,
}: {
  progress: Progress;
  name: string;
  rewardText: string;
}) {
  const view = progress.view;
  return (
    <div className="space-y-4 rounded-xl border bg-muted/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Customer preview
      </p>
      <p className="text-sm font-semibold">{name || "Your card"}</p>
      {view.kind === "plant" ? (
        <div className="flex flex-col items-center gap-2">
          <Plant
            stage={view.stage}
            totalStages={view.totalStages}
            wilting={view.wilting}
          />
        </div>
      ) : view.kind === "streak" ? (
        <div className="flex flex-col items-center gap-2">
          <StreakFlame
            current={view.current}
            target={view.target}
            status={view.status}
          />
        </div>
      ) : view.kind === "chance" ? (
        <div className="flex flex-col items-center gap-2">
          {view.variant === "wheel" ? (
            <Wheel segments={view.segments} landedId={view.landedId} />
          ) : (
            <ScratchCard revealed={false} label="" reward={false} />
          )}
        </div>
      ) : view.kind === "dots" ? (
        <StampDots filled={view.filled} total={view.total} />
      ) : null}
      <p className="font-mono text-sm font-medium">{progress.label}</p>
      <p className="text-sm text-muted-foreground">
        Reward: {rewardText || "—"}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/app/setup/preview-card.dom.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/setup/preview-card.tsx src/app/setup/preview-card.dom.test.tsx
git commit -m "feat: PreviewCard component for /setup live preview"
```

---

### Task 3: Wire the live preview into `SetupForm`

**Files:**

- Modify: `src/app/setup/setup-form.tsx`
- Test: `src/app/setup/setup-form.dom.test.tsx` (new file — no prior test coverage exists for `SetupForm`)

**Interfaces:**

- Consumes: `buildPreviewProgress`, `PreviewInput` (Task 1, `@/app/setup/preview-state`); `PreviewCard` (Task 2, `@/app/setup/preview-card`).
- Produces: no new exports — this task only changes `SetupForm`'s internals and rendered output.

- [ ] **Step 1: Write the failing test**

Create `src/app/setup/setup-form.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { saveMock } = vi.hoisted(() => ({
  saveMock: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/setup/actions", () => ({
  saveProgramAction: saveMock,
  changeTypeAction: vi.fn().mockResolvedValue({}),
  prepProgramAction: vi.fn().mockResolvedValue({}),
}));

import { SetupForm } from "@/app/setup/setup-form";

describe("SetupForm live preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the preview on every keystroke", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByText("0/10 stamps")).toBeInTheDocument();

    const stampsInput = screen.getByLabelText("Stamps required");
    await user.clear(stampsInput);
    await user.type(stampsInput, "5");

    expect(screen.getByText("0/5 stamps")).toBeInTheDocument();
  });

  it("reflects head-start seeding in the preview when the toggle is on", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByLabelText(/give new customers a head start/i));
    expect(screen.getByText("2/10 stamps")).toBeInTheDocument();
  });

  it("still submits the edited controlled field values", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.type(screen.getByLabelText("Card name"), "Coffee card");
    await user.type(screen.getByLabelText("Reward"), "Free kopi");
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("name")).toBe("Coffee card");
    expect(submitted.get("reward_text")).toBe("Free kopi");
    expect(submitted.get("stamps_required")).toBe("10");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: FAIL — `screen.getByText("0/10 stamps")` finds nothing (no preview rendered yet).

- [ ] **Step 3: Add the preview imports**

In `src/app/setup/setup-form.tsx`, add to the existing import block (after the `@/lib/utils` import):

```ts
import { buildPreviewProgress } from "@/app/setup/preview-state";
import { PreviewCard } from "@/app/setup/preview-card";
```

- [ ] **Step 4: Convert the uncontrolled fields to controlled state**

Replace the entire block from `const initialType: ProgramType =` through the closing brace of `removeSegment` (the state/derived-value/handler setup, before the `return (`) with:

```tsx
const initialType: ProgramType =
  program?.type === "lucky" ||
  program?.type === "plant" ||
  program?.type === "wheel" ||
  program?.type === "scratch" ||
  program?.type === "streak"
    ? program.type
    : "stamp";
const [type, setType] = useState<ProgramType>(initialType);
// "template" shows the curated grid (the default for both plain create and
// migrate flows); "custom" falls back to today's raw type grid. Only
// meaningful when !isEdit — isEdit always shows the locked static label.
const [pickerMode, setPickerMode] = useState<"template" | "custom">("template");
// Which template tile is selected, or null (custom mode, or no pick yet) —
// used only to highlight the selected tile. Field values themselves are
// set directly by pickTemplate/pickCustomType below, not derived from this.
const [selectedTemplateKey, setSelectedTemplateKey] = useState<string | null>(
  null,
);

const config = (program?.config ?? {}) as {
  win_probability?: number;
  pity_ceiling?: number;
  reward_text?: string;
  stages?: { threshold: number }[];
  segments?: { label: string; weight: number; reward_text?: string }[];
  period_days?: number;
  target_streak?: number;
};

// Every field below is controlled — the same state drives both form
// submission and the live preview, updated on every keystroke.
const [name, setName] = useState(program?.name ?? "");
const [rewardText, setRewardText] = useState(
  program?.reward_text ?? config.reward_text ?? "",
);
const [stampsRequired, setStampsRequired] = useState(
  program?.stamps_required ?? 10,
);
const [visitsToBloom, setVisitsToBloom] = useState(
  config.stages?.[config.stages.length - 1]?.threshold ?? 6,
);
const [winPercent, setWinPercent] = useState(
  config.win_probability ? Math.round(config.win_probability * 100) : 20,
);
const [pityCeiling, setPityCeiling] = useState<number | undefined>(
  config.pity_ceiling,
);
const [periodDays, setPeriodDays] = useState(config.period_days ?? 7);
const [targetStreak, setTargetStreak] = useState(config.target_streak ?? 4);

const [segments, setSegments] = useState<SegmentInput[]>(
  config.segments?.map((s) => ({
    label: s.label,
    weight: s.weight,
    is_reward: !!s.reward_text,
  })) ?? DEFAULT_SEGMENTS,
);
const [headStart, setHeadStart] = useState(program?.head_start ?? false);
const [carryOverStamps, setCarryOverStamps] = useState(false);
const showCarryOverOption =
  replacingId !== null && replacingType === "stamp" && type === "stamp";

const previewProgress = buildPreviewProgress({
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  periodDays,
  targetStreak,
  segments,
  headStart,
});

function pickTemplate(template: (typeof TEMPLATES)[number]) {
  const d = template.defaults;
  setType(template.type);
  setSelectedTemplateKey(template.key);
  setName(d.name);
  setRewardText(d.reward_text);
  if (d.stamps_required !== undefined) setStampsRequired(d.stamps_required);
  if (d.visits_to_bloom !== undefined) setVisitsToBloom(d.visits_to_bloom);
  if (d.win_percent !== undefined) setWinPercent(d.win_percent);
  setPityCeiling(d.pity_ceiling);
  if (d.period_days !== undefined) setPeriodDays(d.period_days);
  if (d.target_streak !== undefined) setTargetStreak(d.target_streak);
}

function pickCustomType(value: ProgramType) {
  setType(value);
  setSelectedTemplateKey(null);
  setName("");
  setRewardText("");
  setStampsRequired(10);
  setVisitsToBloom(6);
  setWinPercent(20);
  setPityCeiling(value === "lucky" ? 8 : undefined);
  setPeriodDays(7);
  setTargetStreak(4);
}

function updateSegment(index: number, patch: Partial<SegmentInput>) {
  setSegments((prev) =>
    prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
  );
}

function addSegment() {
  setSegments((prev) => [
    ...prev,
    { label: "New prize", weight: 1, is_reward: false },
  ]);
}

function removeSegment(index: number) {
  setSegments((prev) => prev.filter((_, i) => i !== index));
}
```

This removes the `prefill`/`prefillGeneration` variables entirely — every field that read from them now gets its value directly from `pickTemplate`/`pickCustomType`.

- [ ] **Step 5: Convert the stamp-type inputs (name, stamps_required)**

In the `type === "stamp"` branch, replace the `name` Input:

```tsx
<Input
  key={`name-${prefillGeneration}`}
  id="name"
  name="name"
  type="text"
  required
  maxLength={60}
  placeholder="Coffee card"
  defaultValue={prefill?.name ?? program?.name ?? ""}
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="name"
  name="name"
  type="text"
  required
  maxLength={60}
  placeholder="Coffee card"
  value={name}
  onChange={(e) => setName(e.target.value)}
  className="h-11 rounded-xl"
/>
```

and the `stamps_required` Input:

```tsx
<Input
  key={`stamps_required-${prefillGeneration}`}
  id="stamps_required"
  name="stamps_required"
  type="number"
  required
  min={2}
  max={20}
  placeholder="10"
  defaultValue={prefill?.stamps_required ?? program?.stamps_required ?? 10}
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="stamps_required"
  name="stamps_required"
  type="number"
  required
  min={2}
  max={20}
  placeholder="10"
  value={stampsRequired}
  onChange={(e) => setStampsRequired(Number(e.target.value))}
  className="h-11 rounded-xl"
/>
```

- [ ] **Step 6: Convert the plant-type inputs (name, visits_to_bloom)**

In the `type === "plant"` branch, replace the `name` Input:

```tsx
<Input
  key={`name-${prefillGeneration}`}
  id="name"
  name="name"
  type="text"
  required
  maxLength={60}
  placeholder="Grow-a-kopi"
  defaultValue={prefill?.name ?? program?.name ?? ""}
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="name"
  name="name"
  type="text"
  required
  maxLength={60}
  placeholder="Grow-a-kopi"
  value={name}
  onChange={(e) => setName(e.target.value)}
  className="h-11 rounded-xl"
/>
```

and the `visits_to_bloom` Input:

```tsx
<Input
  key={`visits_to_bloom-${prefillGeneration}`}
  id="visits_to_bloom"
  name="visits_to_bloom"
  type="number"
  required
  min={4}
  max={20}
  placeholder="6"
  defaultValue={visitsToBloom}
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="visits_to_bloom"
  name="visits_to_bloom"
  type="number"
  required
  min={4}
  max={20}
  placeholder="6"
  value={visitsToBloom}
  onChange={(e) => setVisitsToBloom(Number(e.target.value))}
  className="h-11 rounded-xl"
/>
```

- [ ] **Step 7: Convert the shared name input (lucky/wheel/scratch/streak branch)**

Replace:

```tsx
<Input
  key={`name-${prefillGeneration}`}
  id="name"
  name="name"
  type="text"
  required
  maxLength={60}
  placeholder={
    type === "lucky"
      ? "Lucky topping"
      : type === "wheel"
        ? "Spin to win"
        : type === "scratch"
          ? "Scratch & win"
          : "Weekly regular"
  }
  defaultValue={prefill?.name ?? program?.name ?? ""}
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="name"
  name="name"
  type="text"
  required
  maxLength={60}
  placeholder={
    type === "lucky"
      ? "Lucky topping"
      : type === "wheel"
        ? "Spin to win"
        : type === "scratch"
          ? "Scratch & win"
          : "Weekly regular"
  }
  value={name}
  onChange={(e) => setName(e.target.value)}
  className="h-11 rounded-xl"
/>
```

- [ ] **Step 8: Convert the streak inputs (period_days, target_streak)**

Replace:

```tsx
<Input
  key={`period_days-${prefillGeneration}`}
  id="period_days"
  name="period_days"
  type="number"
  required
  min={1}
  max={30}
  placeholder="7"
  defaultValue={prefill?.period_days ?? config.period_days ?? 7}
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="period_days"
  name="period_days"
  type="number"
  required
  min={1}
  max={30}
  placeholder="7"
  value={periodDays}
  onChange={(e) => setPeriodDays(Number(e.target.value))}
  className="h-11 rounded-xl"
/>
```

and:

```tsx
<Input
  key={`target_streak-${prefillGeneration}`}
  id="target_streak"
  name="target_streak"
  type="number"
  required
  min={2}
  max={20}
  placeholder="4"
  defaultValue={prefill?.target_streak ?? config.target_streak ?? 4}
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="target_streak"
  name="target_streak"
  type="number"
  required
  min={2}
  max={20}
  placeholder="4"
  value={targetStreak}
  onChange={(e) => setTargetStreak(Number(e.target.value))}
  className="h-11 rounded-xl"
/>
```

- [ ] **Step 9: Convert the wheel/scratch pity_ceiling input**

Replace:

```tsx
<Input
  id="pity_ceiling"
  name="pity_ceiling"
  type="number"
  min={2}
  max={20}
  placeholder="No guarantee"
  defaultValue={config.pity_ceiling ?? ""}
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="pity_ceiling"
  name="pity_ceiling"
  type="number"
  min={2}
  max={20}
  placeholder="No guarantee"
  value={pityCeiling ?? ""}
  onChange={(e) =>
    setPityCeiling(e.target.value === "" ? undefined : Number(e.target.value))
  }
  className="h-11 rounded-xl"
/>
```

- [ ] **Step 10: Convert the lucky inputs (win_percent, pity_ceiling)**

Replace:

```tsx
<Input
  key={`win_percent-${prefillGeneration}`}
  id="win_percent"
  name="win_percent"
  type="number"
  required
  min={2}
  max={100}
  placeholder="20"
  defaultValue={
    prefill?.win_percent ??
    (config.win_probability ? Math.round(config.win_probability * 100) : 20)
  }
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="win_percent"
  name="win_percent"
  type="number"
  required
  min={2}
  max={100}
  placeholder="20"
  value={winPercent}
  onChange={(e) => setWinPercent(Number(e.target.value))}
  className="h-11 rounded-xl"
/>
```

and:

```tsx
<Input
  key={`pity_ceiling-${prefillGeneration}`}
  id="pity_ceiling"
  name="pity_ceiling"
  type="number"
  required
  min={2}
  max={20}
  placeholder="8"
  defaultValue={prefill?.pity_ceiling ?? config.pity_ceiling ?? 8}
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="pity_ceiling"
  name="pity_ceiling"
  type="number"
  required
  min={2}
  max={20}
  placeholder="8"
  value={pityCeiling ?? 8}
  onChange={(e) => setPityCeiling(Number(e.target.value))}
  className="h-11 rounded-xl"
/>
```

- [ ] **Step 11: Convert the reward_text input**

Replace:

```tsx
<Input
  key={`reward_text-${prefillGeneration}`}
  id="reward_text"
  name="reward_text"
  type="text"
  required
  maxLength={80}
  placeholder="Free kopi"
  defaultValue={
    prefill?.reward_text ?? program?.reward_text ?? config.reward_text ?? ""
  }
  className="h-11 rounded-xl"
/>
```

with:

```tsx
<Input
  id="reward_text"
  name="reward_text"
  type="text"
  required
  maxLength={80}
  placeholder="Free kopi"
  value={rewardText}
  onChange={(e) => setRewardText(e.target.value)}
  className="h-11 rounded-xl"
/>
```

- [ ] **Step 12: Wrap the form in the two-column preview layout**

Replace the opening of the returned JSX:

```tsx
  return (
    <form action={formAction} className="mt-7 space-y-5">
```

with:

```tsx
  return (
    <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <form action={formAction} className="space-y-5">
```

and replace the closing of the returned JSX:

```tsx
    </form>
  );
}
```

with:

```tsx
      </form>
      <PreviewCard
        progress={previewProgress}
        name={name}
        rewardText={rewardText}
      />
    </div>
  );
}
```

(Every line between the old opening `<form...>` and closing `</form>` — the type picker, all per-type field blocks, the head-start/carry-over toggles, the expiry input, the error message, and the submit button — is unchanged, just now nested one level deeper inside the wrapping `<div>`.)

- [ ] **Step 13: Run the test to verify it passes**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 14: Run the full suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: both clean — no failures, no `prefill`/`prefillGeneration` references left anywhere in the file (grep `prefillGeneration` in `src/app/setup/setup-form.tsx` to confirm zero matches).

- [ ] **Step 15: Commit**

```bash
git add src/app/setup/setup-form.tsx src/app/setup/setup-form.dom.test.tsx
git commit -m "feat: live loyalty card preview on /setup"
```

---

## Self-Review Notes

- **Spec coverage:** Section A (controlled-field conversion) → Task 3 Steps 4–11. Section B (preview state) → Task 1. Section C (`PreviewCard`) → Task 2. Section D (layout) → Task 3 Step 12. Testing section → each task's own test file. All covered.
- **Placeholder scan:** none — every step shows complete code.
- **Type consistency:** `PreviewInput`'s field names (Task 1) match exactly what Task 3 passes in `buildPreviewProgress({...})`; `PreviewCard`'s props (Task 2) match exactly what Task 3 passes in `<PreviewCard progress={...} name={...} rewardText={...} />`.
