"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Continue angular velocity across the reveal handoff; solve deceleration
// from d = v*t - 0.5*a*t² so the wheel stops on the chosen segment.
// Keep this duration aligned with the preview masking window.
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
      wasSpinning.current = false;
      wasLanded.current = false;
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
      cancel();
      wasSpinning.current = true;
      wasLanded.current = false;
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
      cancel();
      wasLanded.current = true;
      wasSpinning.current = false;

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
          {/* Housing ring + hub read as metal, not a flat UI stroke. */}
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
          {/* Static glare — doesn't rotate with the disc below. */}
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
            // Wax-seal marks a reward wedge beyond color alone. Sits past
            // the label's radial run so it doesn't collide with the text.
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
                  // Gold dividers, not a background-colored gap — real
                  // contrast, ties to the rim's own gold housing.
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
        // z-10: the result overlay below is a full circle that would
        // otherwise paint over the pointer's lower half.
        className="absolute inset-x-0 -top-1.5 z-10 flex justify-center"
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
