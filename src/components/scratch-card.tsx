"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { ScratchCoverStyle } from "@/lib/engine/chance";

export type { ScratchCoverStyle };

type Stroke = { id: number; d: string; delayMs: number; width: number };

const STROKE_BANDS: [number, number][] = [
  [6, 22],
  [22, 40],
  [38, 54],
];
const STEPS_PER_STROKE = 5;
// Last stroke starts at 240ms and draws in over 900ms (globals.css'
// `.scratch-draw-in`) — 1150ms comfortably covers every stroke finishing.
const AUTO_SCRATCH_MS = 1150;
// Canvas card size in CSS px — matches the `h-28 w-48` outer box below.
const CANVAS_W = 192;
const CANVAS_H = 112;
const BRUSH_RADIUS = 13;
// Real scratch cards don't need full coverage to feel "revealed."
const SETTLE_FRACTION = 0.55;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
// path-length measurement needed. This is the jsdom-safe fallback path
// (SVG, no canvas 2D context needed) — see the canvas effect below for the
// real drag-to-scratch layer that sits on top of it in real browsers.
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

type CoverVisual = {
  gradFrom: string;
  gradTo: string;
  textColor: string;
  text: string;
  pattern?: "foil-fleck";
  decoration?: "wax-medallion" | "ticket-lines";
  // Canvas equivalents of the two gradient stops above — CSS `color-mix()`/
  // `var()` aren't resolvable inside a 2D canvas fill, so the canvas draw
  // path needs its own literal colors matching the same material.
  canvasFrom: string;
  canvasMid: string;
  canvasTo: string;
  canvasText: string;
};

const COVER_STYLES: Record<ScratchCoverStyle, CoverVisual> = {
  foil: {
    gradFrom: "#fbe8b8",
    gradTo: "color-mix(in oklch, var(--color-gold) 55%, black)",
    textColor: "#2a1a06",
    text: "Scratch to reveal",
    pattern: "foil-fleck",
    canvasFrom: "#fbe8b8",
    canvasMid: "#caa042",
    canvasTo: "#8a691f",
    canvasText: "rgba(42,26,6,0.9)",
  },
  wax: {
    gradFrom: "var(--color-primary)",
    gradTo: "color-mix(in oklch, var(--color-primary) 55%, black)",
    textColor: "var(--color-primary-foreground)",
    text: "Scratch to reveal",
    pattern: "foil-fleck",
    decoration: "wax-medallion",
    canvasFrom: "#8a2436",
    canvasMid: "#6a1c2a",
    canvasTo: "#4a121c",
    canvasText: "rgba(255,233,214,0.92)",
  },
  ticket: {
    gradFrom: "color-mix(in oklch, var(--color-muted) 90%, black 10%)",
    gradTo: "color-mix(in oklch, var(--color-muted) 60%, black 40%)",
    textColor: "var(--color-gold)",
    text: "SCRATCH & WIN",
    decoration: "ticket-lines",
    canvasFrom: "#3a3630",
    canvasMid: "#2c2924",
    canvasTo: "#201d19",
    canvasText: "#e8c374",
  },
};

// Draws one style's cover art onto the canvas — the real, pointer-driven
// reveal layer. Kept as plain 2D canvas calls (gradients, a few strokes,
// fillText) rather than an image asset, so it stays in sync with the SVG
// fallback's own material choices without shipping two asset pipelines.
function drawCanvasCover(
  ctx: CanvasRenderingContext2D,
  coverStyle: ScratchCoverStyle,
) {
  const visual = COVER_STYLES[coverStyle];
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const grad = ctx.createLinearGradient(0, 0, CANVAS_W, CANVAS_H);
  grad.addColorStop(0, visual.canvasFrom);
  grad.addColorStop(0.55, visual.canvasMid);
  grad.addColorStop(1, visual.canvasTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (coverStyle === "foil") {
    ctx.strokeStyle = "rgba(0,0,0,0.07)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const y = Math.random() * CANVAS_H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_W, y + (Math.random() * 6 - 3));
      ctx.stroke();
    }
  } else if (coverStyle === "wax") {
    ctx.strokeStyle = "rgba(230,180,90,0.55)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(CANVAS_W / 2, CANVAS_H / 2 - 14, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(CANVAS_W / 2, CANVAS_H / 2 - 14, 11, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(230,180,90,0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_W / 2, 8);
    ctx.lineTo(CANVAS_W / 2, CANVAS_H - 8);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = visual.canvasText;
  ctx.font = '700 13px "Plus Jakarta Sans", ui-sans-serif, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    visual.text,
    CANVAS_W / 2,
    CANVAS_H / 2 + (coverStyle === "wax" ? 18 : 0),
  );
}

export function ScratchCard({
  revealed,
  scratching,
  label,
  reward,
  coverStyle = "foil",
  className,
}: {
  revealed: boolean;
  // Leave unset to let the card drive its own scratch-in beat the instant
  // `revealed` turns true (the real customer card: the result is already
  // decided server-side before this ever mounts, so nothing else would
  // ever flip this prop through a scratching phase — same self-driving
  // pattern Wheel now owns for its own spin, off just `landedId`). Pass an
  // explicit boolean when the caller already runs its own reveal timeline
  // (the setup preview's `usePreviewAnimation`), and this stays fully
  // caller-controlled exactly as before.
  scratching?: boolean;
  label: string;
  reward: boolean;
  coverStyle?: ScratchCoverStyle;
  className?: string;
}) {
  const maskId = useId();
  const filterId = useId();
  const strokes = useMemo(() => makeStrokes(), []);
  const visual = COVER_STYLES[coverStyle];

  const autoManaged = scratching === undefined;
  const [reducedMotion] = useState(prefersReducedMotion);
  const playedRef = useRef(false);
  const [autoRevealed, setAutoRevealed] = useState(
    autoManaged && !reducedMotion ? false : revealed,
  );
  const [autoScratching, setAutoScratching] = useState(false);
  // Fires the same reveal transition the auto-scratch timer below would —
  // shared so the canvas layer's "you actually cleared enough" can commit
  // early instead of duplicating the reveal logic.
  const commitRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!autoManaged) return;
    if (!revealed) {
      playedRef.current = false;
      // Syncing to `revealed` going back false (a fresh visit's card) is
      // external-input-driven, not derivable from existing render state —
      // same exception already established elsewhere in this codebase
      // (e.g. Wheel's own landedIndex-driven result sync).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoRevealed(false);
      setAutoScratching(false);
      return;
    }
    if (playedRef.current) return;
    playedRef.current = true;
    if (reducedMotion) {
      setAutoRevealed(true);
      return;
    }
    setAutoScratching(true);
    const commit = () => {
      setAutoScratching(false);
      setAutoRevealed(true);
    };
    commitRef.current = commit;
    const timer = setTimeout(commit, AUTO_SCRATCH_MS);
    return () => {
      clearTimeout(timer);
      commitRef.current = null;
    };
  }, [autoManaged, revealed, reducedMotion]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasUsable, setCanvasUsable] = useState(false);

  // Real drag-to-scratch: a genuine pointer-driven canvas erase (how every
  // production scratch-card widget actually works), layered over the SVG
  // strokes above as a progressive enhancement — not a replacement for
  // them. Only attempted for the real customer card (autoManaged); the
  // setup preview already runs its own externally-timed reveal cycle, and
  // dragging through a simulated preview tick isn't a real interaction
  // worth wiring up. If a 2D context isn't available (jsdom has none,
  // which is exactly why the SVG path above has to stay the guaranteed
  // fallback, not an afterthought) this effect leaves `canvasUsable` false
  // and the SVG strokes keep doing the job, unaffected, exactly as before.
  useEffect(() => {
    if (!autoManaged || reducedMotion) return;
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const canvas = canvasEl;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) return;
    const context = ctx;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CANVAS_W * dpr;
    canvas.height = CANVAS_H * dpr;
    context.scale(dpr, dpr);
    drawCanvasCover(context, coverStyle);
    setCanvasUsable(true);

    let last: { x: number; y: number } | null = null;
    let dragging = false;
    let settled = false;
    let lastCheck = 0;

    function brushAt(x: number, y: number) {
      const grad = context.createRadialGradient(x, y, 0, x, y, BRUSH_RADIUS);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.75, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = grad;
      context.beginPath();
      context.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2);
      context.fill();
    }

    function scratchTo(x: number, y: number) {
      if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        const dist = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.floor(dist / 4));
        for (let i = 1; i <= steps; i++) {
          brushAt(last.x + (dx * i) / steps, last.y + (dy * i) / steps);
        }
      } else {
        brushAt(x, y);
      }
      last = { x, y };
    }

    function clearedFraction() {
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let cleared = 0;
      // Sampled, not every pixel.
      const step = 4 * 17;
      for (let i = 3; i < data.length; i += step) {
        if (data[i] < 40) cleared++;
      }
      return cleared / (data.length / step);
    }

    function checkSettle() {
      if (settled) return;
      // Time-throttled, not event-count-throttled: a real drag fires
      // pointermove at whatever rate the input device gives it, which can
      // spike well above what this needs to sample.
      const now = performance.now();
      if (now - lastCheck < 120) return;
      lastCheck = now;
      if (clearedFraction() >= SETTLE_FRACTION) {
        settled = true;
        commitRef.current?.();
      }
    }

    function pointFromEvent(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
        y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
      };
    }

    function start(e: PointerEvent) {
      dragging = true;
      last = null;
      const p = pointFromEvent(e);
      scratchTo(p.x, p.y);
      checkSettle();
    }
    function move(e: PointerEvent) {
      if (!dragging) return;
      const p = pointFromEvent(e);
      scratchTo(p.x, p.y);
      checkSettle();
    }
    function end() {
      dragging = false;
      last = null;
    }

    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      canvas.removeEventListener("pointerdown", start);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    // `coverStyle` is intentionally included: a style change mid-mount
    // (shouldn't happen in practice, the prop is set once per program)
    // still redraws the canvas from scratch rather than showing a stale
    // material underneath a freshly-relabeled prize.
  }, [autoManaged, reducedMotion, coverStyle]);

  const effectiveRevealed = autoManaged ? autoRevealed : revealed;
  const effectiveScratching = autoManaged
    ? autoScratching
    : (scratching ?? false);

  return (
    <div
      className={cn(
        // Embossed edge (inner highlight + drop shadow), not a flat
        // border — reads as a physical card, not a pasted rectangle.
        "relative h-28 w-48 overflow-hidden rounded-xl border border-gold/25 shadow-[0_3px_10px_-3px_rgb(0_0_0_/_0.35),inset_0_1px_0_0_rgb(255_255_255_/_0.06)]",
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
            "flex items-center gap-1.5 text-sm font-semibold",
            reward ? "text-gold-accent" : "text-muted-foreground",
          )}
        >
          {/* A wax-seal dot marks a win, same motif as the reward wedges
              on Wheel — win/lose reads as more than a color/tone swap. */}
          {reward && (
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-gold ring-1 ring-white/60"
            />
          )}
          {label}
        </p>
      </div>
      {!effectiveRevealed && (
        <>
          {autoManaged && !reducedMotion && (
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              data-testid="scratch-canvas"
              className={cn(
                "absolute inset-0 h-full w-full touch-none",
                !canvasUsable && "hidden",
              )}
            />
          )}
          {/* Cover + "Scratch to reveal" text, masked by 3 overlapping,
              rough-edged scratch strokes instead of the plain opacity-fade
              this used to be. Punching real transparent holes along the
              strokes (rather than fading the whole cover's opacity
              uniformly) is what actually reads as "scratched off" instead
              of a generic wipe/dissolve. This is also the guaranteed
              fallback: it's what renders whenever the canvas above isn't
              usable (jsdom, or a caller-managed reveal like the setup
              preview, which never mounts the canvas at all). */}
          {!canvasUsable && (
            <svg
              aria-hidden="true"
              data-testid="scratch-overlay"
              viewBox="0 0 100 60"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <defs>
                <linearGradient
                  id={`${maskId}-grad`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0%" stopColor={visual.gradFrom} />
                  <stop offset="100%" stopColor={visual.gradTo} />
                </linearGradient>
                {/* Metallic flecks + one static diagonal sheen (not
                    animated, a real foil doesn't sweep), under the same
                    reveal mask as the base gradient — a flat cover reads
                    cheap. */}
                {visual.pattern === "foil-fleck" && (
                  <>
                    <pattern
                      id={`${maskId}-foil`}
                      width="5"
                      height="5"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(12)"
                    >
                      <circle
                        cx="1.1"
                        cy="1.1"
                        r="0.45"
                        fill="white"
                        fillOpacity="0.16"
                      />
                      <circle
                        cx="3.4"
                        cy="3.2"
                        r="0.3"
                        fill="white"
                        fillOpacity="0.1"
                      />
                    </pattern>
                    <linearGradient
                      id={`${maskId}-sheen`}
                      x1="0%"
                      y1="100%"
                      x2="38%"
                      y2="0%"
                    >
                      <stop offset="30%" stopColor="white" stopOpacity="0" />
                      <stop offset="46%" stopColor="white" stopOpacity="0.16" />
                      <stop offset="62%" stopColor="white" stopOpacity="0" />
                    </linearGradient>
                  </>
                )}
                {/* Roughens each stroke's edge into a torn/scratched
                    texture instead of a perfectly smooth round-capped
                    line — a clean line reads as "drawn," a jagged one
                    reads as "scratched." */}
                <filter
                  id={filterId}
                  x="-20%"
                  y="-20%"
                  width="140%"
                  height="140%"
                >
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
                          effectiveScratching
                            ? "scratch-draw-in"
                            : "[stroke-dashoffset:100]",
                        )}
                        style={
                          effectiveScratching
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
              {visual.pattern === "foil-fleck" && (
                <>
                  <rect
                    x="0"
                    y="0"
                    width="100"
                    height="60"
                    fill={`url(#${maskId}-foil)`}
                    mask={`url(#${maskId})`}
                  />
                  <rect
                    x="0"
                    y="0"
                    width="100"
                    height="60"
                    fill={`url(#${maskId}-sheen)`}
                    mask={`url(#${maskId})`}
                  />
                </>
              )}
              {visual.decoration === "wax-medallion" && (
                <g mask={`url(#${maskId})`}>
                  <circle
                    cx="50"
                    cy="24"
                    r="11"
                    fill="none"
                    stroke="var(--color-gold)"
                    strokeWidth="1"
                    strokeOpacity="0.55"
                  />
                  <circle
                    cx="50"
                    cy="24"
                    r="7.5"
                    fill="none"
                    stroke="var(--color-gold)"
                    strokeWidth="0.6"
                    strokeOpacity="0.4"
                  />
                  <path
                    d="M50 18 L52.5 22.5 L57.5 23.2 L54 26.7 L54.8 31.5 L50 29 L45.2 31.5 L46 26.7 L42.5 23.2 L47.5 22.5 Z"
                    fill="var(--color-gold)"
                    fillOpacity="0.5"
                  />
                </g>
              )}
              {visual.decoration === "ticket-lines" && (
                <g mask={`url(#${maskId})`}>
                  <path
                    d="M0 0 L14 0 L0 12 Z"
                    fill="var(--color-gold)"
                    fillOpacity="0.18"
                  />
                  <path
                    d="M100 60 L86 60 L100 48 Z"
                    fill="var(--color-gold)"
                    fillOpacity="0.18"
                  />
                  <line
                    x1="50"
                    y1="4"
                    x2="50"
                    y2="56"
                    stroke="var(--color-gold)"
                    strokeWidth="0.8"
                    strokeOpacity="0.35"
                    strokeDasharray="2 2"
                  />
                </g>
              )}
              <text
                x="50"
                y={visual.decoration === "wax-medallion" ? 46 : 30}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={
                  coverStyle === "ticket" ? "rotate(-4 50 30)" : undefined
                }
                className="text-[7px] font-semibold"
                fill={visual.textColor}
                letterSpacing={coverStyle === "ticket" ? "0.5" : undefined}
                mask={`url(#${maskId})`}
              >
                {visual.text}
              </text>
            </svg>
          )}
        </>
      )}
      {effectiveRevealed && (
        <div
          aria-hidden="true"
          data-testid="scratch-reveal-shine"
          className="scratch-reveal-shine pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
        />
      )}
    </div>
  );
}
