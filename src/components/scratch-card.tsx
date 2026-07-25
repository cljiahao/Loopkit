"use client";

import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

type Stroke = { id: number; d: string; delayMs: number; width: number };

const STROKE_BANDS: [number, number][] = [
  [6, 22],
  [22, 40],
  [38, 54],
];
const STEPS_PER_STROKE = 5;

// Three separate, overlapping, irregular strokes — not one continuous
// zigzag — each covering its own rough vertical band with per-point
// jitter, staggered draw-in delays, and slightly different widths. A
// single clean line reads as "a wiggly line drew itself in"; three
// overlapping irregular passes, worked over slightly out of sync, is much
// closer to how an actual coin/fingernail scratch looks — uneven coverage
// building up over a few strokes, not one uniform sweep. Randomized once
// per mount (same convention as CardBurst's makePieces), in a fixed 100x60
// coordinate space with `pathLength={100}` on each consuming <path> so the
// stroke-dasharray/dashoffset reveal is plain percentages — no runtime
// path-length measurement needed, which also means this is pure SVG/CSS,
// not canvas (jsdom has no real canvas 2D context, and this repo's other
// reward-mechanic visuals — Wheel/Plant/Cup — are already SVG for the same
// testability reason).
function makeStrokes(): Stroke[] {
  return STROKE_BANDS.map(([yMin, yMax], i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    const parts: string[] = [];
    for (let step = 0; step <= STEPS_PER_STROKE; step++) {
      const t = step / STEPS_PER_STROKE;
      const x = dir === 1 ? t * 100 : (1 - t) * 100;
      const y = yMin + Math.random() * (yMax - yMin);
      parts.push(`${step === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    return {
      id: i,
      d: parts.join(" "),
      delayMs: i * 120,
      width: 11 + Math.random() * 5,
    };
  });
}

export function ScratchCard({
  revealed,
  scratching = false,
  label,
  reward,
  className,
}: {
  revealed: boolean;
  scratching?: boolean;
  label: string;
  reward: boolean;
  className?: string;
}) {
  const maskId = useId();
  const filterId = useId();
  const strokes = useMemo(() => makeStrokes(), []);

  return (
    <div
      className={cn(
        "relative h-28 w-48 overflow-hidden rounded-xl border",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-full flex-col items-center justify-center gap-1 p-3 text-center",
          reward ? "bg-gold/10" : "bg-muted/40",
        )}
      >
        <p
          className={cn(
            "text-sm font-semibold",
            reward ? "text-gold-accent" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
      </div>
      {/* Cover + "Scratch to reveal" text, masked by 3 overlapping,
          rough-edged scratch strokes instead of the plain opacity-fade
          this used to be. Punching real transparent holes along the
          strokes (rather than fading the whole cover's opacity uniformly)
          is what actually reads as "scratched off" instead of a generic
          wipe/dissolve. */}
      {!revealed && (
        <svg
          aria-hidden="true"
          data-testid="scratch-overlay"
          viewBox="0 0 100 60"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient id={`${maskId}-grad`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" />
              <stop
                offset="100%"
                stopColor="var(--color-primary)"
                stopOpacity="0.7"
              />
            </linearGradient>
            {/* Roughens each stroke's edge into a torn/scratched texture
                instead of a perfectly smooth round-capped line — a clean
                line reads as "drawn," a jagged one reads as "scratched." */}
            <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.9"
                numOctaves="2"
                seed="7"
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale="4"
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="100"
              height="60"
            >
              <rect x="0" y="0" width="100" height="60" fill="white" />
              <g data-testid="scratch-strokes" filter={`url(#${filterId})`}>
                {strokes.map((s) => (
                  <path
                    key={s.id}
                    data-testid="scratch-path"
                    d={s.d}
                    pathLength={100}
                    fill="none"
                    stroke="black"
                    strokeWidth={s.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={cn(
                      scratching
                        ? "scratch-draw-in"
                        : "[stroke-dashoffset:100]",
                    )}
                    style={
                      scratching
                        ? { animationDelay: `${s.delayMs}ms` }
                        : undefined
                    }
                  />
                ))}
              </g>
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100"
            height="60"
            fill={`url(#${maskId}-grad)`}
            mask={`url(#${maskId})`}
          />
          <text
            x="50"
            y="30"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-primary-foreground text-[7px] font-semibold"
            mask={`url(#${maskId})`}
          >
            Scratch to reveal
          </text>
        </svg>
      )}
      {revealed && (
        <div
          aria-hidden="true"
          data-testid="scratch-reveal-shine"
          className="scratch-reveal-shine pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
        />
      )}
    </div>
  );
}
