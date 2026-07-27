# Fill the Cup Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `Cup`'s SVG from a plain trapezoid + full-ellipse rim + 2-circle flourish into an on-brand cappuccino-shaped mug with a single continuous rim outline, a saucer + pedestal foot for depth, a fixed coffee-color liquid palette, and a tulip-pour "done" flourish.

**Architecture:** Pure visual rewrite of `src/components/cup.tsx` — no engine change (`Cup`'s `{stage, totalStages, wilting}` prop contract is unchanged; `plantStrategy`/`buildPlantConfig` already produce everything it needs). All new geometry is computed from a handful of module-level constants plus the existing `stage`/`totalStages` → `frac` derivation already in the component.

**Tech Stack:** TypeScript, React 19, SVG, Tailwind v4, Vitest + Testing Library (jsdom).

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- The liquid's color is a fixed literal coffee palette (Empty→Sip dark espresso, warming to a caramel-tan latte near Full) — **not** brand-themed. The mug's outline/rim/base/handle/saucer/foot **are** brand-themed (`currentColor`, respecting `wilting`).
- The liquid surface ellipse must always set `cx` explicitly — SVG defaults a `cx`-less `<ellipse>` to `cx=0`, which silently pins it to the left edge of the viewBox. This is a real bug found and fixed during design iteration; do not reintroduce it.
- The rim is one continuous outline path (up the left wall, a dip-arc across the rim front, down the right wall) — never a separate `<ellipse>` floating on top of the walls.
- Testing convention: `*.dom.test.tsx` assertions on class names/rendered content, not pixel-level visual testing.
- Run `pnpm check` before declaring the task done.

---

### Task 1: Rebuild `Cup`'s SVG

**Files:**

- Modify: `src/components/cup.tsx`
- Modify: `src/components/cup.dom.test.tsx`

**Interfaces:**

- Consumes: `Cup`'s existing prop contract — `{ stage: number; totalStages: number; wilting: boolean; className?: string }` — unchanged. No call-site changes needed in `src/features/card-check/components/program-card-status.tsx`, `src/app/setup/preview-card.tsx`, or `src/app/dashboard/serve-customer.tsx`.
- Produces: internal `data-cup-liquid="body" | "surface"` and `data-cup-tulip="true"` attributes, used by this task's own tests — no other file reads them.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/components/cup.dom.test.tsx` with:

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

  it("renders no liquid at stage 0 (Empty)", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    expect(
      container.querySelector('[data-cup-liquid="body"]'),
    ).not.toBeInTheDocument();
  });

  it("renders a liquid body + surface once growth has started", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    expect(
      container.querySelector('[data-cup-liquid="body"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-cup-liquid="surface"]'),
    ).toBeInTheDocument();
  });

  it("always sets an explicit cx on the liquid surface ellipse (never defaults to 0)", () => {
    const { container } = render(
      <Cup stage={3} totalStages={5} wilting={false} />,
    );
    const surface = container.querySelector('[data-cup-liquid="surface"]');
    expect(surface?.getAttribute("cx")).toBe("50");
  });

  it("draws the mug body as a single continuous outline path, not a separate rim ellipse", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    const strokedPaths = Array.from(container.querySelectorAll("path")).filter(
      (p) =>
        p.getAttribute("stroke") === "currentColor" &&
        p.getAttribute("fill") === "none",
    );
    // Body outline + handle — exactly 2 stroked, unfilled paths.
    expect(strokedPaths).toHaveLength(2);
  });

  it("renders the pedestal foot and saucer for depth, present even when empty", () => {
    const { container } = render(
      <Cup stage={0} totalStages={5} wilting={false} />,
    );
    expect(container.querySelectorAll("ellipse").length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("shows the tulip-pour flourish only at the Full stage", () => {
    const notFull = render(<Cup stage={3} totalStages={5} wilting={false} />);
    expect(
      notFull.container.querySelector("[data-cup-tulip]"),
    ).not.toBeInTheDocument();

    const full = render(<Cup stage={4} totalStages={5} wilting={false} />);
    expect(
      full.container.querySelector("[data-cup-tulip]"),
    ).toBeInTheDocument();
  });

  it("uses the slow shared growth duration on the liquid body", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={false} />,
    );
    const body = container.querySelector('[data-cup-liquid="body"]');
    expect(body?.getAttribute("class")).toContain("duration-[1600ms]");
  });

  it("shifts the liquid color across fill stages (fixed coffee palette, not brand color)", () => {
    const sip = render(<Cup stage={1} totalStages={5} wilting={false} />);
    const full = render(<Cup stage={4} totalStages={5} wilting={false} />);
    const sipBody = sip.container.querySelector(
      '[data-cup-liquid="body"]',
    ) as SVGElement;
    const fullBody = full.container.querySelector(
      '[data-cup-liquid="body"]',
    ) as SVGElement;
    expect(sipBody.style.fill).not.toBe("");
    expect(sipBody.style.fill).not.toBe(fullBody.style.fill);
  });

  it("dims the liquid to the muted-foreground color when wilting", () => {
    const { container } = render(
      <Cup stage={2} totalStages={5} wilting={true} />,
    );
    const body = container.querySelector(
      '[data-cup-liquid="body"]',
    ) as SVGElement;
    expect(body.style.fill).toContain("var(--color-muted-foreground)");
  });

  it("fades and scales the tulip flourish in on mount instead of popping", () => {
    const { container } = render(
      <Cup stage={4} totalStages={5} wilting={false} />,
    );
    const tulip = container.querySelector("[data-cup-tulip]");
    expect(tulip?.getAttribute("class")).toContain("starting:opacity-0");
    expect(tulip?.getAttribute("class")).toContain("starting:scale-0");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/components/cup.dom.test.tsx`
Expected: FAIL — the current component has no `data-cup-liquid`/`data-cup-tulip` attributes, and its liquid is a plain `<rect>` with a Tailwind `fill-primary/60` class rather than a fixed-palette inline style.

- [ ] **Step 3: Rebuild the component**

Replace the full contents of `src/components/cup.tsx` with:

```tsx
import { cn } from "@/lib/utils";

const GROWTH_TRANSITION =
  "motion-safe:transition-all motion-safe:duration-[1600ms] motion-safe:ease-out";

const CUP_TOP_Y = 26;
const CUP_BOTTOM_Y = 68;
const TOP_HALF = 26;
const BOTTOM_HALF = 17;
const RIM_DIP_Y = 34;
// Clamp so the flat liquid surface never visually pokes above the rim's
// front dip (which curves down to RIM_DIP_Y) when the cup is Full.
const LIQUID_MAX_TOP_Y = 32;

// Fixed coffee palette by stage index (index 0 = Empty, never rendered) —
// the substance being depicted, not overridden by vendor brand theming.
// Same category as Flame's fixed fire palette. First pass, tunable.
const LIQUID_COLORS = ["", "#3b2415", "#5a3820", "#8a5a2f", "#c99a5b"];

function halfWidthAt(y: number): number {
  const t = (CUP_BOTTOM_Y - y) / (CUP_BOTTOM_Y - CUP_TOP_Y);
  return BOTTOM_HALF + (TOP_HALF - BOTTOM_HALF) * t;
}

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
  const isFull = stage >= totalStages - 1 && totalStages > 1;
  const liquidTopY = Math.max(
    CUP_BOTTOM_Y - (CUP_BOTTOM_Y - CUP_TOP_Y) * frac,
    LIQUID_MAX_TOP_Y,
  );
  const liquidColor = wilting
    ? "var(--color-muted-foreground)"
    : (LIQUID_COLORS[Math.min(stage, LIQUID_COLORS.length - 1)] ??
      LIQUID_COLORS[1]);
  const surfaceHalfWidth = halfWidthAt(liquidTopY);

  const bodyPath = `M${50 - BOTTOM_HALF} ${CUP_BOTTOM_Y} L${50 - TOP_HALF} ${CUP_TOP_Y} Q50 ${RIM_DIP_Y} ${50 + TOP_HALF} ${CUP_TOP_Y} L${50 + BOTTOM_HALF} ${CUP_BOTTOM_Y} Z`;

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
      {/* Pedestal foot + saucer, drawn before the mug — the saucer's own
          disc naturally occludes the top of the foot, peeking out only at
          the bottom, like a soy-sauce dish. Two stacked objects in space is
          most of what actually reads as "3D" here. */}
      <ellipse cx="50" cy="86" rx="9" ry="2.5" className="fill-current/25" />
      <rect x="46" y="74" width="8" height="10" className="fill-current/25" />
      <ellipse cx="50" cy="72" rx="24" ry="4" className="fill-current/15" />

      {frac > 0 && (
        <path
          data-cup-liquid="body"
          d={`M${50 - BOTTOM_HALF} ${CUP_BOTTOM_Y} L${50 - surfaceHalfWidth} ${liquidTopY} L${50 + surfaceHalfWidth} ${liquidTopY} L${50 + BOTTOM_HALF} ${CUP_BOTTOM_Y} Z`}
          style={{ fill: liquidColor }}
          className={GROWTH_TRANSITION}
        />
      )}
      {frac > 0 && (
        <ellipse
          data-cup-liquid="surface"
          cx="50"
          cy={liquidTopY}
          rx={surfaceHalfWidth}
          ry="3"
          style={{ fill: liquidColor }}
          className={GROWTH_TRANSITION}
        />
      )}

      <path
        d={bodyPath}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d={`M${50 + TOP_HALF - 1} 34 q13 0 13 13 q0 13 -13 13`}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {isFull && (
        <g
          data-cup-tulip="true"
          style={{ transformOrigin: `50px ${liquidTopY}px` }}
          className={cn(
            GROWTH_TRANSITION,
            "opacity-100 scale-100 starting:opacity-0 starting:scale-0",
          )}
        >
          <path
            d={`M50 ${liquidTopY} Q44 ${liquidTopY - 7} 50 ${liquidTopY - 12} Q56 ${liquidTopY - 7} 50 ${liquidTopY} Z`}
            className={wilting ? "fill-muted-foreground" : "fill-gold"}
          />
          <path
            d={`M50 ${liquidTopY} Q46.5 ${liquidTopY - 4} 50 ${liquidTopY - 7} Q53.5 ${liquidTopY - 4} 50 ${liquidTopY} Z`}
            className={
              wilting ? "fill-muted-foreground/70" : "fill-gold-foreground"
            }
          />
          <line
            x1="50"
            y1={liquidTopY}
            x2="50"
            y2={liquidTopY + 3}
            strokeWidth="1.5"
            className={
              wilting ? "stroke-muted-foreground" : "stroke-gold-accent"
            }
          />
        </g>
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/components/cup.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite and quality gate**

Run: `pnpm test --run && pnpm check`
Expected: All green — `src/app/setup/preview-card.dom.test.tsx` and `src/features/card-check/components/program-card-status.dom.test.tsx` render `Cup` too but only assert the label text, not its internal shape count, so they should pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/components/cup.tsx src/components/cup.dom.test.tsx
git commit -m "feat(cup): redraw Fill the Cup with saucer/pedestal depth and a fixed coffee palette"
```
