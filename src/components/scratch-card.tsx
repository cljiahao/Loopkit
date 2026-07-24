"use client";

import { useId, useMemo } from "react";
import { cn } from "@/lib/utils";

const SCRATCH_ROWS = 5;
const SCRATCH_STEPS_PER_ROW = 6;

// A believable "scratched back and forth by hand" reveal path — an
// irregular zigzag with per-point jitter, not a clean geometric shape —
// generated once per mount (same randomize-once convention as CardBurst's
// makePieces). Declared in a fixed 100x60 coordinate space with
// `pathLength={100}` on the consuming <path> so the stroke-dasharray/
// dashoffset reveal below is expressed as plain percentages — no runtime
// path-length measurement (`getTotalLength()`) needed, which also means
// this is pure SVG/CSS, not canvas (jsdom has no real canvas 2D context,
// and this repo's other reward-mechanic visuals — Wheel/Plant/Cup — are
// already SVG, not canvas, for the same testability reason).
function makeScratchPathD(): string {
  const parts: string[] = [];
  for (let row = 0; row < SCRATCH_ROWS; row++) {
    const y = 8 + (row * (60 - 16)) / (SCRATCH_ROWS - 1);
    const dir = row % 2 === 0 ? 1 : -1;
    for (let i = 0; i <= SCRATCH_STEPS_PER_ROW; i++) {
      const t = i / SCRATCH_STEPS_PER_ROW;
      const x = dir === 1 ? t * 100 : (1 - t) * 100;
      const jitter = (Math.random() - 0.5) * 7;
      parts.push(
        `${row === 0 && i === 0 ? "M" : "L"} ${x.toFixed(1)} ${(y + jitter).toFixed(1)}`,
      );
    }
  }
  return parts.join(" ");
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
  const pathD = useMemo(() => makeScratchPathD(), []);

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
      {/* Cover + "Scratch to reveal" text, masked by an irregular scratch
          trail instead of the plain opacity-fade this used to be. Punching
          real transparent holes along the trail (rather than fading the
          whole cover's opacity uniformly) is what actually reads as
          "scratched off" instead of a generic wipe/dissolve. */}
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
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              width="100"
              height="60"
            >
              <rect x="0" y="0" width="100" height="60" fill="white" />
              <path
                data-testid="scratch-path"
                d={pathD}
                pathLength={100}
                fill="none"
                stroke="black"
                strokeWidth="14"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn(
                  "[stroke-dasharray:100] motion-safe:transition-[stroke-dashoffset] motion-safe:duration-[900ms] motion-safe:ease-out",
                  scratching
                    ? "[stroke-dashoffset:0]"
                    : "[stroke-dashoffset:100]",
                )}
              />
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
