"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Real constant-angular-deceleration ("friction") kinematics, computed and
// driven per-frame via requestAnimationFrame — deliberately NOT a CSS
// transition/animation at all. A CSS easing curve is a fixed shape chosen
// upfront; it can't be told "you're currently moving at exactly this
// velocity, now decelerate smoothly from THERE to a dead stop on this
// target," which is exactly the problem at the boundary between "target
// still unknown" and "target now known" — a curve chosen without knowing
// the actual handoff velocity either restarts slow (reads as choppy/
// discontinuous) or restarts fast (reads as "constant, then suddenly so
// fast," which is what this was). Computing position analytically each
// frame from real physics lets stage 2 continue the EXACT velocity stage 1
// had reached, instead of two disconnected curves stitched together.
//
// Physics: for constant deceleration a from initial velocity v0, distance
// covered over time t is d(t) = v0*t - 0.5*a*t², and velocity is
// v(t) = v0 - a*t. Stage 1 uses fixed v0/a for the whole masked window
// (a real decelerating spin from the very first frame, not a flat
// constant speed). At the instant the target becomes known, stage 2 reads
// the exact v1 = v(elapsed) stage 1 had reached, then solves fresh for an
// a2 that brings the wheel to a dead stop (v=0) exactly on the target
// angle: given v1 and a chosen total distance (segment's exact landing
// angle + a couple of extra full turns), t2 = 2*distance/v1 and
// a2 = v1/t2 — the unique constant deceleration that covers that distance
// and reaches zero velocity at the same instant.
// Matches the parent's REVEAL_MS masking window.
const STAGE1_DURATION_MS = 1400;
// Angular velocity (deg/s) at the instant the spin starts.
const STAGE1_V0 = 1400;
// Angular deceleration (deg/s^2) — real, continuous deceleration while the
// target segment is still unknown.
const STAGE1_DECEL = 260;
const STAGE2_EXTRA_TURNS = 1;
// Velocity floor (deg/s) so a very late handoff never reads as "starting
// from a stall."
const MIN_HANDOFF_VELOCITY = 60;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function targetAngleMod(landedIndex: number, anglePerSegment: number): number {
  const raw = 360 - (landedIndex * anglePerSegment + anglePerSegment / 2);
  return ((raw % 360) + 360) % 360;
}

export function Wheel({
  segments,
  landedId,
  spinning,
  onSettled,
  className,
}: {
  segments: {
    id: string;
    label: string;
    reward: boolean;
    color?: string;
  }[];
  landedId: string | null;
  spinning?: boolean;
  // Fires once, exactly when the settle physics simulation actually
  // finishes (or, under reduced-motion, immediately). The wheel's settle
  // duration is now a real physics computation, not a fixed number — a
  // caller that reveals a result on its own fixed timer (e.g. a win/lose
  // pill) needs this signal to stay in sync instead of appearing before
  // the wheel has visually finished spinning.
  onSettled?: () => void;
  className?: string;
}) {
  const count = segments.length;
  const anglePerSegment = 360 / count;
  const landedIndex = landedId
    ? segments.findIndex((s) => s.id === landedId)
    : -1;

  const [angle, setAngle] = useState(0);
  const angleRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const stage1 = useRef<{ baseAngle: number; startTime: number } | null>(null);
  const wasSpinning = useRef(false);
  const wasLanded = useRef(false);
  const [reducedMotion] = useState(prefersReducedMotion);
  // Latest callback in a ref (not the effect's dependency list) so an
  // inline arrow function passed by the caller doesn't retrigger the whole
  // spin effect on every parent render.
  const onSettledRef = useRef(onSettled);

  useEffect(() => {
    angleRef.current = angle;
  }, [angle]);

  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    function cancel() {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (reducedMotion) {
      if (landedIndex >= 0) {
        // Syncing to the now-known landed segment (external input from
        // props, via the parent's engine roll), not a value derivable from
        // existing render state — same external-input-driven case already
        // established elsewhere in this codebase (e.g. preview-card.tsx's
        // showChanceResult), so the render-time-derivation case
        // react-hooks/set-state-in-effect guards against doesn't apply.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAngle(targetAngleMod(landedIndex, anglePerSegment));
        onSettledRef.current?.();
      }
      return;
    }

    if (spinning && landedIndex < 0 && !wasSpinning.current) {
      wasSpinning.current = true;
      wasLanded.current = false;
      cancel();
      const baseAngle = angleRef.current;
      const startTime = performance.now();
      stage1.current = { baseAngle, startTime };

      function stage1Frame(now: number) {
        const elapsedS = Math.min(
          (now - startTime) / 1000,
          STAGE1_DURATION_MS / 1000,
        );
        const delta =
          STAGE1_V0 * elapsedS - 0.5 * STAGE1_DECEL * elapsedS * elapsedS;
        setAngle(baseAngle + delta);
        if (elapsedS < STAGE1_DURATION_MS / 1000) {
          frameRef.current = requestAnimationFrame(stage1Frame);
        }
      }
      frameRef.current = requestAnimationFrame(stage1Frame);
      return cancel;
    }

    if (landedIndex >= 0 && !wasLanded.current) {
      wasLanded.current = true;
      wasSpinning.current = false;
      cancel();

      const elapsedS = stage1.current
        ? Math.min(
            (performance.now() - stage1.current.startTime) / 1000,
            STAGE1_DURATION_MS / 1000,
          )
        : STAGE1_DURATION_MS / 1000;
      const v1 = Math.max(
        STAGE1_V0 - STAGE1_DECEL * elapsedS,
        MIN_HANDOFF_VELOCITY,
      );

      const currentAngle = angleRef.current;
      const currentMod = ((currentAngle % 360) + 360) % 360;
      const targetMod = targetAngleMod(landedIndex, anglePerSegment);
      let deltaToTarget = targetMod - currentMod;
      if (deltaToTarget <= 0) deltaToTarget += 360;
      const distance = deltaToTarget + STAGE2_EXTRA_TURNS * 360;

      // Unique constant deceleration that covers `distance` starting at
      // v1 and reaches exactly 0 velocity at the same instant it arrives.
      const t2 = (2 * distance) / v1;
      const a2 = v1 / t2;

      const baseAngle = currentAngle;
      const startTime = performance.now();

      function stage2Frame(now: number) {
        const t = Math.min((now - startTime) / 1000, t2);
        const delta = v1 * t - 0.5 * a2 * t * t;
        setAngle(baseAngle + delta);
        if (t < t2) {
          frameRef.current = requestAnimationFrame(stage2Frame);
        } else {
          onSettledRef.current?.();
        }
      }
      frameRef.current = requestAnimationFrame(stage2Frame);
      return cancel;
    }

    return undefined;
    // `angle` is intentionally read via `angleRef` (a ref, not a
    // dependency) rather than the `angle` state value itself — it's this
    // effect's own animation OUTPUT, not an input that should retrigger
    // it; including it would restart the physics solve on every frame
    // instead of once per spin/landing.
  }, [spinning, landedIndex, anglePerSegment, reducedMotion]);

  return (
    <div className={cn("relative inline-block size-32", className)}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-32">
        <g
          data-testid="wheel-rotor"
          style={{
            transformOrigin: "50px 50px",
            transform: `rotate(${angle}deg)`,
          }}
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
                  // A vendor-picked color (segment.color, the wheel color
                  // picker in setup-form.tsx) wins when set. Otherwise:
                  // reward segments read as an unambiguous "win" color
                  // (emerald, not the low-contrast muted-gold this used to
                  // be) against a clearly "not this one" muted-rose for
                  // non-reward segments — the two need to be tellable
                  // apart at a glance, not just on close inspection.
                  {...(segment.color
                    ? { fill: segment.color }
                    : {
                        className: segment.reward
                          ? "fill-emerald-500 dark:fill-emerald-400"
                          : "fill-rose-400/70 dark:fill-rose-500/60",
                      })}
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
                    // A custom segment color can be anywhere on the
                    // brightness spectrum, so a fixed light/dark text color
                    // can't be guaranteed readable against it — white text
                    // with a dark outline (paint-order+stroke, not a real
                    // CSS text-shadow which SVG <text> doesn't support)
                    // stays legible against any background color.
                    segment.color
                      ? "fill-white [paint-order:stroke] [stroke-linejoin:round] [stroke-width:2.5px] stroke-black/60"
                      : segment.reward
                        ? "fill-white"
                        : "fill-rose-950/70 dark:fill-white/80",
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
