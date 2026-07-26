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
