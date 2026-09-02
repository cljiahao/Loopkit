"use client";

import { useEffect, useId, useRef, useState } from "react";
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
// How long the win/lose overlay stays up once the wheel settles.
const RESULT_VISIBLE_MS = 1500;

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
  // finishes (or, under reduced-motion, immediately), with the TRUE
  // win/lose result derived directly from the landed segment — not a
  // separately-threaded value from the caller. Wheel previously took no
  // result of its own and expected the caller to track a matching
  // "is the wheel done yet" flag against its own separately-sourced
  // win/lose value; keeping two independently-updated sources of truth in
  // sync across an async multi-second animation was a real synchronization
  // bug surface (and the caller's badge, disconnected from the wheel
  // itself, didn't read as "on" the wheel the way CardBurst's overlay
  // does). Wheel now owns both.
  onSettled?: (result: { won: boolean }) => void;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
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

  // The wheel's own win/lose result, set the instant it actually settles —
  // derived from the landed segment directly, the single source of truth
  // for both this overlay and (via onSettled) the caller's celebration
  // burst.
  const [result, setResult] = useState<{ won: boolean } | null>(null);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    angleRef.current = angle;
  }, [angle]);

  useEffect(() => {
    onSettledRef.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    if (!result) return;
    // result is set the instant the settle animation finishes (see the
    // spin effect below) — external, not derivable from existing render
    // state, same class of exception already established elsewhere in
    // this codebase (e.g. preview-card.tsx's showChanceResult).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowResult(true);
    const timer = setTimeout(() => setShowResult(false), RESULT_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [result]);

  useEffect(() => {
    function cancel() {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (reducedMotion) {
      if (landedIndex >= 0) {
        const won = !!segments[landedIndex]?.reward;
        // Syncing to the now-known landed segment (external input from
        // props, via the parent's engine roll), not a value derivable from
        // existing render state — same external-input-driven case already
        // established elsewhere in this codebase.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAngle(targetAngleMod(landedIndex, anglePerSegment));
        setResult({ won });
        onSettledRef.current?.({ won });
      }
      return;
    }

    if (spinning && landedIndex < 0 && !wasSpinning.current) {
      wasSpinning.current = true;
      wasLanded.current = false;
      cancel();
      // Clear any previous spin's result immediately — a new spin means
      // the old badge shouldn't linger while the wheel spins again.
      setResult(null);
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
      // Captured once per landing, not re-read at settle time — segments
      // (and therefore the landed one's reward flag) don't change mid-spin.
      const won = !!segments[landedIndex]?.reward;

      function stage2Frame(now: number) {
        const t = Math.min((now - startTime) / 1000, t2);
        const delta = v1 * t - 0.5 * a2 * t * t;
        setAngle(baseAngle + delta);
        if (t < t2) {
          frameRef.current = requestAnimationFrame(stage2Frame);
        } else {
          setResult({ won });
          onSettledRef.current?.({ won });
        }
      }
      frameRef.current = requestAnimationFrame(stage2Frame);
      return cancel;
    }

    return undefined;
    // `angle`/`result` are this effect's own animation OUTPUT (read via
    // angleRef / set imperatively), not inputs that should retrigger it —
    // including them would restart the physics solve on every frame
    // instead of once per spin/landing. `segments` is read fresh each
    // landing via closure, not a dependency, since a segment edit mid-spin
    // already fully resets the form's recipe (and this component) upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, landedIndex, anglePerSegment, reducedMotion]);

  const rimGradId = `${uid}-rim`;
  const hubGoldId = `${uid}-hub-gold`;
  const glossId = `${uid}-gloss`;
  const shadowId = `${uid}-shadow`;

  return (
    <div className={cn("relative inline-block size-32", className)}>
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-32">
        <defs>
          {/* Static housing ring + hub read as metal (antique-brass, the
              theme's own gold token), not a flat stroke — a spin wheel's
              frame is a real physical part, not a UI border. */}
          <radialGradient id={rimGradId} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fbe8b8" />
            <stop offset="55%" stopColor="var(--color-gold)" />
            <stop
              offset="100%"
              stopColor="color-mix(in oklch, var(--color-gold) 55%, black)"
            />
          </radialGradient>
          <radialGradient id={hubGoldId} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fff7e0" />
            <stop offset="55%" stopColor="var(--color-gold)" />
            <stop
              offset="100%"
              stopColor="color-mix(in oklch, var(--color-gold) 55%, black)"
            />
          </radialGradient>
          {/* Static glare — a real light source doesn't spin with the
              disc, so this sits outside the rotor group below. */}
          <radialGradient id={glossId} cx="42%" cy="18%" r="75%">
            <stop offset="0%" stopColor="white" stopOpacity="0.32" />
            <stop offset="55%" stopColor="white" stopOpacity="0.05" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow
              dx="0"
              dy="1.2"
              stdDeviation="1.4"
              floodColor="black"
              floodOpacity="0.32"
            />
          </filter>
        </defs>

        <circle
          cx="50"
          cy="50"
          r="49"
          fill="none"
          stroke={`url(#${rimGradId})`}
          strokeWidth="2.4"
          filter={`url(#${shadowId})`}
        />

        <g
          data-testid="wheel-rotor"
          filter={`url(#${shadowId})`}
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
            // A wax-seal medallion, not just a color, marks a reward wedge
            // — win/lose should read even to someone who can't tell
            // emerald from rose apart. Tucked in near the rim, past where
            // the label's own radial run ends, so it reads as a corner
            // accent rather than colliding with the text.
            const sx = 50 + 45 * Math.cos(midRad);
            const sy = 50 + 45 * Math.sin(midRad);
            const rewardTextClass = segment.reward
              ? "fill-white"
              : "fill-rose-950/70 dark:fill-white/80";
            const segmentTextClass = segment.color
              ? "fill-white [paint-order:stroke] [stroke-linejoin:round] [stroke-width:2.5px] stroke-black/60"
              : rewardTextClass;
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
                  // Gold dividers instead of a background-colored gap —
                  // reads as inlaid metal between wedges (real contrast,
                  // not just a seam) and ties the disc to the rim's own
                  // gold housing.
                  stroke="var(--color-gold)"
                  strokeWidth="0.5"
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
                    segmentTextClass,
                  )}
                >
                  {segment.label}
                </text>
                {segment.reward && (
                  <circle
                    cx={sx}
                    cy={sy}
                    r="1.7"
                    fill="var(--color-gold)"
                    stroke="white"
                    strokeOpacity="0.7"
                    strokeWidth="0.3"
                  />
                )}
              </g>
            );
          })}
        </g>

        {/* Static glare sits above the rotor but never rotates with it. */}
        <circle cx="50" cy="50" r="47.5" fill={`url(#${glossId})`} />

        <circle cx="50" cy="50" r="6" fill={`url(#${hubGoldId})`} />
        <circle cx="50" cy="50" r="3.4" className="fill-primary" />
        <circle cx="48.6" cy="48.6" r="0.9" fill="white" opacity="0.55" />
      </svg>
      <div
        className="absolute inset-x-0 -top-1.5 flex justify-center"
        style={{ filter: "drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.4))" }}
      >
        <svg width="16" height="15" viewBox="0 0 16 15" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-pointer`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbe8b8" />
              <stop offset="100%" stopColor="var(--color-gold)" />
            </linearGradient>
          </defs>
          <polygon
            points="8,15 0,1 16,1"
            fill={`url(#${uid}-pointer)`}
            stroke="var(--color-background)"
            strokeWidth="0.75"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {/* The result overlay lives ON the wheel itself, not a corner badge
          disconnected from the thing that just happened — same "overlay
          the thing it's about" treatment CardBurst already uses. */}
      {result && showResult && (
        <div
          aria-hidden="true"
          data-testid="wheel-result"
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center gap-1 rounded-full text-sm font-bold shadow-lg",
            result.won
              ? "bg-gold/90 text-gold-foreground"
              : "bg-background/85 text-muted-foreground",
          )}
        >
          {result.won ? "🎉 You won!" : "Try again"}
        </div>
      )}
    </div>
  );
}
