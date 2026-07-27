# Sprout Restage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the real gap in `Plant` where "Budding" (stage 3) is visually indistinguishable from "Leafing" (stage 2) by restaging so each of the 5 stages introduces exactly one new visual element: seed → stem-only sprout with a closed tip nub → both leaf pairs together → a bud → the bud opens into bloom.

**Architecture:** Pure visual rewrite of `src/components/plant.tsx` — no engine change (`Plant`'s `{stage, totalStages, wilting}` prop contract and `plantStrategy`/`buildPlantConfig` are unchanged). The stem now reaches its full height by stage 2 (Leafing) and holds there for stages 3-4, rather than continuing to scale all the way to stage 4 — this is what makes "stem height doesn't change further" true once leaves arrive.

**Tech Stack:** TypeScript, React 19, SVG, Tailwind v4, Vitest + Testing Library (jsdom).

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Stem/leaves/bud stay on the vendor's brand color (`currentColor`, respecting `wilting`); the bloom stays fixed gold — this is the shared "reward-moment accent" pattern also used by Cup's tulip. Growth visuals stay on-brand; only the terminal reward flourish is a literal fixed color.
- The Sprout stage's tip nub must not fade in before the stem has visually finished growing to meet it (a `transitionDelay` matching the stem's own `duration-[1600ms]` growth transition) — an earlier iteration had this bug ("sprouting in thin air").
- Leaves stay visible at Bloom — do not gate leaf visibility on `stage < totalStages - 1` or similar; real flowers keep their leaves.
- Testing convention: `*.dom.test.tsx` assertions on class names/rendered content, not pixel-level visual testing.
- Run `pnpm check` before declaring the task done.

---

### Task 1: Restage `Plant`'s stem/leaf/bud/bloom sequence

**Files:**

- Modify: `src/components/plant.tsx`
- Modify: `src/components/plant.dom.test.tsx`

**Interfaces:**

- Consumes: `Plant`'s existing prop contract — `{ stage: number; totalStages: number; wilting: boolean; className?: string }` — unchanged. No call-site changes needed in `src/features/card-check/components/program-card-status.tsx`, `src/app/setup/preview-card.tsx`, or `src/app/dashboard/serve-customer.tsx`.
- Produces: internal `data-plant-tip-nub`, `data-plant-leaf`, `data-plant-bud` attributes, used by this task's own tests.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/components/plant.dom.test.tsx` with:

```tsx
// src/components/plant.dom.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Plant } from "@/components/plant";

describe("Plant", () => {
  it("renders an svg", () => {
    const { container } = render(
      <Plant stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("collapses the stem to zero height and shows the seed dot at Seed (stage 0)", () => {
    const { container } = render(
      <Plant stage={0} totalStages={5} wilting={false} />,
    );
    const line = container.querySelector("line");
    expect(line).toHaveStyle({ transform: "scaleY(0)" });
    const seed = Array.from(container.querySelectorAll("circle")).find((c) =>
      c.getAttribute("class")?.includes("fill-primary/60"),
    );
    expect(seed).toBeInTheDocument();
  });

  it("shoots the stem to half height and shows a pale closed tip nub at Sprout (stage 1), no leaves yet", () => {
    const { container } = render(
      <Plant stage={1} totalStages={5} wilting={false} />,
    );
    const line = container.querySelector("line");
    expect(line).toHaveStyle({ transform: "scaleY(0.5)" });
    expect(container.querySelector("[data-plant-tip-nub]")).toBeInTheDocument();
    const leaves = container.querySelectorAll("[data-plant-leaf]");
    expect(leaves).toHaveLength(2);
    expect(
      Array.from(leaves).every((l) =>
        l.getAttribute("class")?.includes("opacity-0"),
      ),
    ).toBe(true);
  });

  it("delays the tip nub's fade-in to match the stem's own grow duration", () => {
    const { container } = render(
      <Plant stage={1} totalStages={5} wilting={false} />,
    );
    const nub = container.querySelector("[data-plant-tip-nub]");
    expect(nub).toHaveStyle({ transitionDelay: "1600ms" });
  });

  it("brings both leaf pairs in together and reaches full stem height at Leafing (stage 2)", () => {
    const { container } = render(
      <Plant stage={2} totalStages={5} wilting={false} />,
    );
    const line = container.querySelector("line");
    expect(line).toHaveStyle({ transform: "scaleY(1)" });
    expect(
      container.querySelector("[data-plant-tip-nub]"),
    ).not.toBeInTheDocument();
    const leaves = container.querySelectorAll("[data-plant-leaf]");
    expect(leaves).toHaveLength(2);
    expect(
      Array.from(leaves).every((l) =>
        l.getAttribute("class")?.includes("opacity-100"),
      ),
    ).toBe(true);
  });

  it("keeps stem height and leaf position stable from Leafing into Budding, and adds only a bud", () => {
    const leafing = render(<Plant stage={2} totalStages={5} wilting={false} />);
    const budding = render(<Plant stage={3} totalStages={5} wilting={false} />);

    expect(leafing.container.querySelector("line")).toHaveStyle({
      transform: "scaleY(1)",
    });
    expect(budding.container.querySelector("line")).toHaveStyle({
      transform: "scaleY(1)",
    });

    const leafingLeafD = leafing.container
      .querySelectorAll("[data-plant-leaf]")[0]
      .querySelector("path")
      ?.getAttribute("d");
    const buddingLeafD = budding.container
      .querySelectorAll("[data-plant-leaf]")[0]
      .querySelector("path")
      ?.getAttribute("d");
    expect(leafingLeafD).toBe(buddingLeafD);

    expect(
      leafing.container.querySelector("[data-plant-bud]"),
    ).not.toBeInTheDocument();
    expect(
      budding.container.querySelector("[data-plant-bud]"),
    ).toBeInTheDocument();
  });

  it("renders the bloom only at the final stage, with leaves still visible", () => {
    const notBloom = render(
      <Plant stage={3} totalStages={5} wilting={false} />,
    );
    // Shadow ellipse only — no bloom petals yet (bud is a <circle>, not an
    // <ellipse>, so it doesn't add to this count).
    expect(notBloom.container.querySelectorAll("ellipse")).toHaveLength(1);

    const bloom = render(<Plant stage={4} totalStages={5} wilting={false} />);
    // Shadow ellipse + 6 petal ellipses.
    expect(bloom.container.querySelectorAll("ellipse")).toHaveLength(7);
    const leaves = bloom.container.querySelectorAll("[data-plant-leaf]");
    expect(
      Array.from(leaves).every((l) =>
        l.getAttribute("class")?.includes("opacity-100"),
      ),
    ).toBe(true);
  });

  it("dims the plant color when wilting", () => {
    const { container } = render(
      <Plant stage={2} totalStages={5} wilting={true} />,
    );
    expect(container.querySelector("svg")?.getAttribute("class")).toContain(
      "text-muted-foreground",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/components/plant.dom.test.tsx`
Expected: FAIL — the current component shows a leaf pair already at stage 1 (`leafPairs = min(stage, 3)`), has no tip nub, no bud, and the stem keeps growing all the way to stage 4.

- [ ] **Step 3: Rewrite the component**

Replace the full contents of `src/components/plant.tsx` with:

```tsx
import { cn } from "@/lib/utils";

const SOIL_Y = 74;
const STEM_MAX_Y = 18;
const LEAF_PAIRS = 2;
// The stem shoots up through Seed -> Sprout -> Leafing and then holds —
// Budding/Bloom add a bud/flower at its tip, they don't grow it further.
const STEM_FULL_HEIGHT_STAGE = 2;
const GROWTH_TRANSITION =
  "motion-safe:transition-all motion-safe:duration-[1600ms] motion-safe:ease-out";

export function Plant({
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
  const isBloom = stage >= totalStages - 1 && totalStages > 1;
  const stemFrac =
    Math.min(stage, STEM_FULL_HEIGHT_STAGE) / STEM_FULL_HEIGHT_STAGE;
  const stemTopY = SOIL_Y - (SOIL_Y - STEM_MAX_Y) * stemFrac;
  const leavesVisible = stage >= STEM_FULL_HEIGHT_STAGE;
  const showTipNub = stage === 1;
  const showBud = stage === 3;

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
      <path
        d="M32 74 h36 l-4 16 a2 2 0 0 1 -2 2 h-24 a2 2 0 0 1 -2 -2 z"
        className="fill-primary/25 stroke-primary/40"
        strokeWidth="1.5"
      />
      <rect
        x="30"
        y="70"
        width="40"
        height="6"
        rx="2"
        className="fill-primary/35"
      />
      <g
        style={{
          transformOrigin: "50px 74px",
          transform: wilting ? "rotate(9deg)" : "none",
        }}
        className="motion-safe:transition-transform motion-safe:duration-500"
      >
        <line
          x1="50"
          y1={SOIL_Y}
          x2="50"
          y2={STEM_MAX_Y}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          style={{
            transformOrigin: `50px ${SOIL_Y}px`,
            transform: `scaleY(${stemFrac})`,
          }}
          className={GROWTH_TRANSITION}
        />
        {stage === 0 && (
          <circle cx="50" cy="70" r="3.5" className="fill-primary/60" />
        )}
        {showTipNub && (
          <circle
            data-plant-tip-nub="true"
            cx="50"
            cy={stemTopY}
            r="3"
            style={{ transitionDelay: "1600ms" }}
            className={cn(
              "motion-safe:transition-opacity motion-safe:duration-300",
              "opacity-100 starting:opacity-0",
              wilting ? "fill-muted-foreground/60" : "fill-primary/40",
            )}
          />
        )}
        {Array.from({ length: LEAF_PAIRS }, (_, i) => {
          const t = (i + 1) / (LEAF_PAIRS + 1);
          const y = SOIL_Y - (SOIL_Y - STEM_MAX_Y) * t;
          return (
            <g
              key={i}
              data-plant-leaf="true"
              style={{ transformOrigin: `50px ${y}px` }}
              className={cn(
                GROWTH_TRANSITION,
                leavesVisible ? "opacity-100 scale-100" : "opacity-0 scale-0",
              )}
            >
              <path
                d={`M50 ${y} q -14 -6 -20 -14 q 12 0 20 8 z`}
                fill="currentColor"
              />
              <path
                d={`M50 ${y} q 14 -6 20 -14 q -12 0 -20 8 z`}
                fill="currentColor"
              />
            </g>
          );
        })}
        {showBud && (
          <circle
            data-plant-bud="true"
            cx="50"
            cy={STEM_MAX_Y}
            r="3.5"
            fill="currentColor"
            style={{ transformOrigin: `50px ${STEM_MAX_Y}px` }}
            className={cn(
              GROWTH_TRANSITION,
              "opacity-100 scale-100 starting:opacity-0 starting:scale-0",
            )}
          />
        )}
        {isBloom && (
          <g
            style={{ transformOrigin: `50px ${STEM_MAX_Y}px` }}
            className={cn(
              GROWTH_TRANSITION,
              "opacity-100 scale-100 starting:opacity-0 starting:scale-0",
            )}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <ellipse
                key={i}
                cx="50"
                cy={STEM_MAX_Y - 8}
                rx="4.5"
                ry="9"
                className={wilting ? "fill-muted-foreground/50" : "fill-gold"}
                style={{
                  transformOrigin: `50px ${STEM_MAX_Y}px`,
                  transform: `rotate(${i * 60}deg)`,
                }}
              />
            ))}
            <circle
              cx="50"
              cy={STEM_MAX_Y}
              r="5"
              className={
                wilting ? "fill-muted-foreground" : "fill-gold-foreground"
              }
            />
          </g>
        )}
      </g>
    </svg>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/plant.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite and quality gate**

Run: `pnpm test --run && pnpm check`
Expected: All green — `src/app/setup/preview-card.dom.test.tsx` and `src/features/card-check/components/program-card-status.dom.test.tsx` render `Plant` too but only assert the label text, not leaf/stem internals, so they should pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/plant.tsx src/components/plant.dom.test.tsx
git commit -m "feat(plant): restage Sprout so each stage introduces exactly one new visual"
```
