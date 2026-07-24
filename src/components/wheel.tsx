"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// One continuous, monotonically-increasing rotation value drives both the
// "still spinning, result unknown yet" phase and the final settle — never a
// CSS `animation` (like `animate-spin`) handed off to a `transition` once
// the result resolves. That handoff is a documented source of a visible
// jump/stutter (the browser doesn't reliably capture the animation's
// current computed value before the transition takes over), which is what
// read as "choppy." Using one mechanism (React state + `transition-transform`)
// throughout, always advancing forward and never resetting backward, avoids
// that class of bug entirely and reads as one continuous spin instead of
// two disconnected animations stitched together.
//
// The final settle uses a strong ease-out curve (`cubic-bezier(0.16,1,0.3,1)`,
// an "ease-out-expo"-style curve real prize-wheel implementations use for
// friction-based deceleration) with NO overshoot/bounce-back — a real wheel
// slowing down from friction decelerates smoothly to a stop, it doesn't
// spring past the target and rock back; that artificial bounce (the
// previous "back-out" easing here) is what didn't read as real physics.
const SPIN_TURN_DEG = 3 * 360;
const SETTLE_EXTRA_TURNS = 2 * 360;

export function Wheel({
  segments,
  landedId,
  spinning,
  className,
}: {
  segments: { id: string; label: string; reward: boolean }[];
  landedId: string | null;
  spinning?: boolean;
  className?: string;
}) {
  const count = segments.length;
  const anglePerSegment = 360 / count;
  const landedIndex = landedId
    ? segments.findIndex((s) => s.id === landedId)
    : -1;

  const [rotation, setRotation] = useState(0);
  const wasSpinning = useRef(false);
  const wasLanded = useRef(false);

  useEffect(() => {
    if (spinning && landedIndex < 0) {
      if (!wasSpinning.current) {
        wasSpinning.current = true;
        wasLanded.current = false;
        setRotation((r) => r + SPIN_TURN_DEG);
      }
      return;
    }
    if (landedIndex >= 0 && !wasLanded.current) {
      wasLanded.current = true;
      wasSpinning.current = false;
      setRotation((r) => {
        const targetMod =
          (((360 - (landedIndex * anglePerSegment + anglePerSegment / 2)) %
            360) +
            360) %
          360;
        const currentMod = ((r % 360) + 360) % 360;
        let delta = targetMod - currentMod;
        if (delta <= 0) delta += 360;
        return r + delta + SETTLE_EXTRA_TURNS;
      });
    }
  }, [spinning, landedIndex, anglePerSegment]);

  return (
    <div className={cn("relative inline-block size-32", className)}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-32">
        <g
          style={{
            transformOrigin: "50px 50px",
            transform: `rotate(${rotation}deg)`,
          }}
          className={cn(
            "motion-safe:transition-transform motion-safe:duration-[1400ms]",
            spinning && landedIndex < 0
              ? "motion-safe:ease-linear"
              : "motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]",
          )}
        >
          {segments.map((segment, i) => {
            const startAngle = ((i * anglePerSegment - 90) * Math.PI) / 180;
            const endAngle = (((i + 1) * anglePerSegment - 90) * Math.PI) / 180;
            const x1 = 50 + 48 * Math.cos(startAngle);
            const y1 = 50 + 48 * Math.sin(startAngle);
            const x2 = 50 + 48 * Math.cos(endAngle);
            const y2 = 50 + 48 * Math.sin(endAngle);
            const largeArc = anglePerSegment > 180 ? 1 : 0;
            const midAngle = i * anglePerSegment + anglePerSegment / 2 - 90;
            const midRad = (midAngle * Math.PI) / 180;
            const tx = 50 + 30 * Math.cos(midRad);
            const ty = 50 + 30 * Math.sin(midRad);
            return (
              <g key={segment.id}>
                <path
                  d={`M50 50 L${x1} ${y1} A48 48 0 ${largeArc} 1 ${x2} ${y2} Z`}
                  className={segment.reward ? "fill-gold/70" : "fill-muted"}
                  stroke="var(--background)"
                  strokeWidth="0.6"
                />
                <text
                  x={tx}
                  y={ty}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${midAngle + 90} ${tx} ${ty})`}
                  className={cn(
                    "text-[6px] font-semibold",
                    segment.reward
                      ? "fill-gold-foreground"
                      : "fill-muted-foreground",
                  )}
                >
                  {segment.label}
                </text>
              </g>
            );
          })}
        </g>
        <circle cx="50" cy="50" r="4" className="fill-primary" />
      </svg>
      <div className="absolute inset-x-0 -top-1 flex justify-center">
        <div className="size-0 border-x-8 border-t-8 border-x-transparent border-t-primary" />
      </div>
    </div>
  );
}
