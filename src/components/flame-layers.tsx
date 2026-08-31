"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// ---------- shape geometry (ported verbatim from the approved reference) ----------

type FlameShapeFn = (cx: number, baseY: number, h: number, w: number) => string;

// asymmetric single-lick silhouette — curls in on the left only, tip leans
// right; a mirrored/symmetric one reads as a leaf, not fire
function flameCur(cx: number, baseY: number, h: number, w: number): string {
  return `M${cx - w} ${baseY}
    C${cx - w * 1.05} ${baseY - h * 0.1} ${cx - w * 0.9} ${baseY - h * 0.62} ${cx - w * 0.25} ${baseY - h * 0.55}
    C${cx - w * 0.55} ${baseY - h * 0.72} ${cx - w * 0.15} ${baseY - h * 0.92} ${cx + w * 0.1} ${baseY - h}
    C${cx + w * 0.05} ${baseY - h * 0.78} ${cx + w * 0.35} ${baseY - h * 0.66} ${cx + w * 0.3} ${baseY - h * 0.42}
    C${cx + w * 0.55} ${baseY - h * 0.5} ${cx + w * 0.85} ${baseY - h * 0.28} ${cx + w} ${baseY}
    C${cx + w * 0.4} ${baseY + h * 0.04} ${cx - w * 0.4} ${baseY + h * 0.04} ${cx - w} ${baseY}
    Z`;
}

function flameSoft(cx: number, baseY: number, h: number, w: number): string {
  return `M${cx - w} ${baseY}
    C${cx - w} ${baseY - h * 0.55} ${cx - w * 0.55} ${baseY - h * 0.95} ${cx - w * 0.1} ${baseY - h}
    C${cx + w * 0.3} ${baseY - h * 0.92} ${cx + w} ${baseY - h * 0.5} ${cx + w} ${baseY} Z`;
}

function flameCandle(cx: number, baseY: number, h: number, w: number): string {
  return `M${cx - w * 0.7} ${baseY}
    C${cx - w * 0.75} ${baseY - h * 0.3} ${cx - w * 0.3} ${baseY - h * 0.55} ${cx - w * 0.15} ${baseY - h * 0.75}
    C${cx - w * 0.35} ${baseY - h * 0.85} ${cx - w * 0.1} ${baseY - h * 0.95} ${cx + w * 0.05} ${baseY - h}
    C${cx + w * 0.15} ${baseY - h * 0.9} ${cx + w * 0.15} ${baseY - h * 0.78} ${cx + w * 0.28} ${baseY - h * 0.68}
    C${cx + w * 0.5} ${baseY - h * 0.5} ${cx + w * 0.7} ${baseY - h * 0.25} ${cx + w * 0.65} ${baseY}
    Z`;
}

function flameTriTongue(
  cx: number,
  baseY: number,
  h: number,
  w: number,
): string {
  const one = (ox: number, sh: number, sw: number) =>
    flameCandle(cx + ox, baseY, h * sh, w * sw);
  return one(-w * 0.5, 0.62, 0.55) + one(0, 1, 0.6) + one(w * 0.5, 0.7, 0.5);
}

// deterministic stand-in for the reference's Math.random() jitter — same
// visual variety (organic, non-uniform timing/scatter) without a
// server/client hydration mismatch
function seeded(seed: number, min: number, max: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  const frac = x - Math.floor(x);
  return min + frac * (max - min);
}

type FlameTemp = {
  base: string;
  mid: string;
  tip: string;
  coreLo: string;
  coreHi: string;
};

const FLAME_TEMP: Record<"spark" | "small" | "medium", FlameTemp> = {
  spark: {
    base: "#c2410c",
    mid: "#f59e0b",
    tip: "#fef3c7",
    coreLo: "#fde68a",
    coreHi: "#fffbeb",
  },
  small: {
    base: "#b45309",
    mid: "#fbbf24",
    tip: "#fef9e0",
    coreLo: "#fde68a",
    coreHi: "#fffdf5",
  },
  medium: {
    base: "#9a3412",
    mid: "#f97316",
    tip: "#fde68a",
    coreLo: "#fdba74",
    coreHi: "#fff4d6",
  },
};

type LayerKey = "ember" | "spark" | "small" | "medium" | "large";

const LAYER_STAGE: Record<LayerKey, number> = {
  ember: 0,
  spark: 1,
  small: 2,
  medium: 3,
  large: 4,
};

// Ember<->Spark, and the Full Campfire->Ember redemption jump, cross in
// place: no delay, both layers scale together. Small->Medium->Large instead
// grow immediately while the old layer lingers, then shrinks late — reads as
// the flame growing from within itself rather than two shapes swapping.
const SYNC_TRANSITION_MS = 550;
const GROW_TRANSITION_MS = 600;
const SHRINK_TRANSITION_MS = 500;
const SHRINK_DELAY_MS = 300;
const TRANSITION_EASE = "cubic-bezier(0.22,0.8,0.32,1)";

function layerTransition(
  layer: LayerKey,
  stage: number,
): { durationMs: number; delayMs: number } {
  if (layer === "ember" || layer === "spark") {
    return { durationMs: SYNC_TRANSITION_MS, delayMs: 0 };
  }
  if (stage === LAYER_STAGE[layer]) {
    return { durationMs: GROW_TRANSITION_MS, delayMs: 0 };
  }
  if (layer === "large" && stage === 0) {
    return { durationMs: SYNC_TRANSITION_MS, delayMs: 0 };
  }
  return { durationMs: SHRINK_TRANSITION_MS, delayMs: SHRINK_DELAY_MS };
}

function StageGroup({
  layer,
  stage,
  coalHook,
  children,
}: {
  layer: LayerKey;
  stage: number;
  coalHook?: boolean;
  children: ReactNode;
}) {
  const isActive = stage === LAYER_STAGE[layer];
  const { durationMs, delayMs } = layerTransition(layer, stage);
  return (
    <g
      data-flame-layer={layer}
      data-flame-coal={coalHook && stage === 0 ? "true" : undefined}
      className="motion-safe:transition-transform"
      style={{
        transformBox: "fill-box",
        transformOrigin: "50% 50%",
        transform: isActive ? "scale(1)" : "scale(0)",
        transitionTimingFunction: TRANSITION_EASE,
        transitionDuration: `${durationMs}ms`,
        transitionDelay: `${delayMs}ms`,
      }}
    >
      {children}
    </g>
  );
}

function CrossedLogs({ gradientId }: { gradientId: string }) {
  const log = (angle: number) => (
    <rect
      key={angle}
      data-flame-log="true"
      x={-22}
      y={-4}
      width={44}
      height={8}
      rx={4}
      fill={`url(#${gradientId})`}
      transform={`translate(50,87) rotate(${angle})`}
    />
  );
  return (
    <>
      {log(-16)}
      {log(16)}
    </>
  );
}

function EmberHotspot({
  x,
  y,
  r,
  fill,
  seed,
}: {
  x: number;
  y: number;
  r: number;
  fill: string;
  seed: number;
}) {
  return (
    <ellipse
      className="[transform-box:fill-box] origin-center motion-safe:animate-flame-ember-pulse"
      cx={x}
      cy={y}
      rx={r}
      ry={r * 0.65}
      fill={fill}
      style={{
        animationDelay: `${seeded(seed, 0, 1.5)}s`,
        animationDuration: `${seeded(seed + 0.3, 1.4, 2.2)}s`,
      }}
    />
  );
}

function SparkPop({
  cx,
  cy,
  seed,
  delay,
}: {
  cx: number;
  cy: number;
  seed: number;
  delay: number;
}) {
  return (
    <circle
      className="[transform-box:fill-box] origin-center motion-safe:animate-flame-spark-pop"
      cx={cx}
      cy={cy}
      r={seeded(seed, 0.7, 1.3)}
      fill="#ffdd88"
      style={{
        animationDelay: `${delay}s`,
        animationDuration: `${seeded(seed + 0.4, 0.8, 1.5)}s`,
      }}
    />
  );
}

function GhostFlame({
  cx,
  baseY,
  fill,
  filterId,
  delay,
  seed,
}: {
  cx: number;
  baseY: number;
  fill: string;
  filterId: string;
  delay: number;
  seed: number;
}) {
  return (
    <path
      className="[transform-box:fill-box] origin-bottom motion-safe:animate-flame-spark-fade"
      d={flameSoft(cx, baseY, 5, 2.6)}
      fill={fill}
      opacity={0.55}
      filter={`url(#${filterId})`}
      style={{
        animationDelay: `${delay}s`,
        animationDuration: `${seeded(seed, 1.3, 1.8)}s`,
      }}
    />
  );
}

function EmberLayerContent({ coalGradientId }: { coalGradientId: string }) {
  const coals = Array.from({ length: 6 }, (_, i) => {
    const x = 50 - 10 + i * 4;
    const y = 83 + (i % 2) * 1.2;
    const r = 1.5 + (i % 3) * 0.4;
    return (
      <g key={i}>
        <circle cx={x} cy={y} r={r} fill={`url(#${coalGradientId})`} />
        <EmberHotspot x={x} y={y} r={r * 0.55} fill="#ffb84d" seed={i} />
      </g>
    );
  });
  return (
    <>
      {coals}
      <SparkPop cx={47} cy={79} seed={30} delay={0} />
      <SparkPop cx={52} cy={77} seed={31} delay={0.4} />
      <SparkPop cx={55} cy={80} seed={32} delay={0.8} />
    </>
  );
}

function SparkLayerContent({
  coalGradientId,
  ghostBlurId,
}: {
  coalGradientId: string;
  ghostBlurId: string;
}) {
  const temp = FLAME_TEMP.spark;
  const dots = Array.from({ length: 5 }, (_, i) => {
    const angle = seeded(40 + i, 0, Math.PI);
    const radius = seeded(40 + i + 0.5, 2, 4.5);
    return (
      <SparkPop
        key={i}
        cx={49 + Math.cos(angle) * radius}
        cy={79 - Math.sin(angle) * radius}
        seed={40 + i + 0.25}
        delay={seeded(40 + i + 0.75, 0, 0.25)}
      />
    );
  });
  return (
    <>
      <ellipse
        cx={50}
        cy={84.5}
        rx={7.5}
        ry={3.4}
        fill={`url(#${coalGradientId})`}
      />
      <ellipse
        cx={49}
        cy={83}
        rx={4.5}
        ry={2.2}
        fill={`url(#${coalGradientId})`}
        opacity={0.7}
      />
      <EmberHotspot x={48} y={83.5} r={1.4} fill="#ffb84d" seed={20} />
      <GhostFlame
        cx={47.5}
        baseY={82.5}
        fill={temp.tip}
        filterId={ghostBlurId}
        delay={0}
        seed={21}
      />
      <GhostFlame
        cx={52}
        baseY={82.5}
        fill={temp.tip}
        filterId={ghostBlurId}
        delay={0.6}
        seed={22}
      />
      {dots}
    </>
  );
}

function FlameComposite({
  shapeFn,
  cx,
  baseY,
  h,
  w,
  temp,
  sparkCount,
  wisp,
  coreScale = 0.55,
  idPrefix,
  seedBase,
}: {
  shapeFn: FlameShapeFn;
  cx: number;
  baseY: number;
  h: number;
  w: number;
  temp: FlameTemp;
  sparkCount: number;
  wisp: boolean;
  coreScale?: number;
  idPrefix: string;
  seedBase: number;
}) {
  const glowId = `${idPrefix}-glow`;
  const outerId = `${idPrefix}-outer`;
  const coreId = `${idPrefix}-core`;

  const sparks = Array.from({ length: sparkCount }, (_, i) => {
    const seed = seedBase + i;
    return (
      <circle
        key={i}
        className="motion-safe:animate-flame-spark-rise"
        cx={cx + seeded(seed, -w * 0.7, w * 0.7)}
        cy={baseY - seeded(seed + 0.5, h * 1.1, h * 1.9)}
        r={seeded(seed + 0.25, 0.7, 1.6)}
        fill="#ffdd88"
        style={{
          animationDelay: `${seeded(seed + 0.75, 0, 2)}s`,
          animationDuration: `${seeded(seed + 0.1, 1.1, 2)}s`,
        }}
      />
    );
  });

  return (
    <>
      <defs>
        <filter id={glowId} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation={Math.max(1, h * 0.07)} />
        </filter>
        <linearGradient id={outerId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={temp.base} />
          <stop offset="55%" stopColor={temp.mid} />
          <stop offset="100%" stopColor={temp.tip} />
        </linearGradient>
        <linearGradient id={coreId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={temp.coreLo} />
          <stop offset="100%" stopColor={temp.coreHi} />
        </linearGradient>
      </defs>
      <path
        className="motion-safe:animate-flame-glow-pulse"
        d={shapeFn(cx, baseY, h * 1.06, w * 1.08)}
        fill={temp.mid}
        opacity={0.45}
        filter={`url(#${glowId})`}
        style={{ animationDuration: `${seeded(seedBase, 1.6, 2.4)}s` }}
      />
      <path
        className="[transform-box:fill-box] origin-bottom motion-safe:animate-flame-flicker-outer"
        d={shapeFn(cx, baseY, h, w)}
        fill={`url(#${outerId})`}
        style={{ animationDuration: `${seeded(seedBase + 1, 1.8, 2.5)}s` }}
      />
      <path
        className="[transform-box:fill-box] origin-bottom motion-safe:animate-flame-flicker-inner"
        d={shapeFn(cx, baseY - 0.4, h * coreScale, w * coreScale * 0.85)}
        fill={`url(#${coreId})`}
        opacity={0.92}
        style={{ animationDuration: `${seeded(seedBase + 2, 1.3, 1.9)}s` }}
      />
      {wisp && (
        <path
          className="motion-safe:animate-flame-wisp-drift"
          d={`M${cx - 1} ${baseY - h * 0.75} C${cx - 3} ${baseY - h * 0.95} ${cx + 2} ${baseY - h * 1.05} ${cx} ${baseY - h * 1.25}
              C${cx + 3} ${baseY - h * 1.05} ${cx + 1} ${baseY - h * 0.9} ${cx + 1.5} ${baseY - h * 0.72} Z`}
          fill={temp.tip}
          opacity={0.35}
          filter={`url(#${glowId})`}
          style={{
            animationDuration: `${seeded(seedBase + 3, 2, 3)}s`,
            animationDelay: `${seeded(seedBase + 3.5, 0, 1.5)}s`,
          }}
        />
      )}
      {sparks}
    </>
  );
}

function LargeFlameComposite({
  cx,
  baseY,
  idPrefix,
}: {
  cx: number;
  baseY: number;
  idPrefix: string;
}) {
  const glowId = `${idPrefix}-glow`;
  const outerId = `${idPrefix}-outer`;
  const coreId = `${idPrefix}-core`;

  const sparks = Array.from({ length: 7 }, (_, i) => {
    const seed = 50 + i;
    return (
      <circle
        key={i}
        className="motion-safe:animate-flame-spark-rise"
        cx={cx + seeded(seed, -10, 10)}
        cy={baseY - seeded(seed + 0.5, 18, 36)}
        r={seeded(seed + 0.25, 0.9, 1.8)}
        fill="#ffdd88"
        style={{
          animationDelay: `${seeded(seed + 0.75, 0, 2.2)}s`,
          animationDuration: `${seeded(seed + 0.1, 1.2, 2.1)}s`,
        }}
      />
    );
  });

  const smokePuffs = Array.from({ length: 3 }, (_, i) => {
    const seed = 60 + i;
    const sx = cx + seeded(seed, -4, 4);
    return (
      <path
        key={i}
        className="motion-safe:animate-flame-smoke-drift"
        d={`M${sx - 3} ${baseY - 34} C${sx - 6} ${baseY - 44} ${sx + 4} ${baseY - 50} ${sx} ${baseY - 60}
            C${sx + 5} ${baseY - 52} ${sx - 2} ${baseY - 44} ${sx + 2} ${baseY - 34} Z`}
        fill="#9ca3af"
        style={{
          animationDelay: `${seeded(seed + 0.5, 0, 4)}s`,
          animationDuration: `${seeded(seed + 0.25, 3.5, 5.5)}s`,
        }}
      />
    );
  });

  return (
    <>
      <defs>
        <filter id={glowId} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation={2.4} />
        </filter>
        <linearGradient id={outerId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#7f1d1d" />
          <stop offset="45%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fde047" />
        </linearGradient>
        <linearGradient id={coreId} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fffbeb" />
        </linearGradient>
      </defs>
      {smokePuffs}
      <path
        className="motion-safe:animate-flame-glow-pulse"
        d={flameCur(cx, baseY, 34, 17)}
        fill="#f97316"
        opacity={0.5}
        filter={`url(#${glowId})`}
        style={{ animationDuration: `${seeded(70, 1.6, 2.4)}s` }}
      />
      <path
        className="[transform-box:fill-box] origin-bottom motion-safe:animate-flame-flicker-outer"
        d={flameCur(cx, baseY, 33, 16)}
        fill={`url(#${outerId})`}
        style={{ animationDuration: `${seeded(71, 1.9, 2.5)}s` }}
      />
      <path
        className="[transform-box:fill-box] origin-bottom motion-safe:animate-flame-flicker-inner"
        d={flameCur(cx, baseY - 1, 19, 7)}
        fill={`url(#${coreId})`}
        opacity={0.92}
        style={{ animationDuration: `${seeded(72, 1.4, 1.9)}s` }}
      />
      <path
        className="motion-safe:animate-flame-wisp-drift"
        d={`M${cx - 1} ${baseY - 24} C${cx - 3} ${baseY - 30} ${cx + 2} ${baseY - 33} ${cx} ${baseY - 40}
            C${cx + 3} ${baseY - 34} ${cx + 1} ${baseY - 29} ${cx + 1.5} ${baseY - 23} Z`}
        fill="#fde047"
        opacity={0.4}
        style={{
          animationDuration: `${seeded(73, 2, 3)}s`,
          animationDelay: `${seeded(73.5, 0, 1.5)}s`,
        }}
      />
      {sparks}
    </>
  );
}

export function FlameLayers({
  filled,
  total,
  stage,
  stageName,
  className,
}: {
  filled: number;
  total: number;
  stage: number;
  stageName: string;
  className?: string;
}) {
  const id = useId();
  const logGradId = `${id}-log`;
  const coalGradId = `${id}-coal`;
  const ghostBlurId = `${id}-ghost-blur`;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        data-flame-stage={stage}
        className="flex size-32 flex-col items-center justify-end gap-1 pb-1"
      >
        <svg viewBox="0 0 100 100" aria-hidden="true" className="size-28">
          <defs>
            <linearGradient id={logGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9c7248" />
              <stop offset="100%" stopColor="#5c3d24" />
            </linearGradient>
            <radialGradient id={coalGradId} cx="40%" cy="30%" r="75%">
              <stop offset="0%" stopColor="#ff9d4d" />
              <stop offset="55%" stopColor="#e8590c" />
              <stop offset="100%" stopColor="#7c2d12" />
            </radialGradient>
            <filter
              id={ghostBlurId}
              x="-60%"
              y="-60%"
              width="220%"
              height="220%"
            >
              <feGaussianBlur stdDeviation={0.6} />
            </filter>
          </defs>

          <CrossedLogs gradientId={logGradId} />

          <StageGroup layer="ember" stage={stage} coalHook>
            <EmberLayerContent coalGradientId={coalGradId} />
          </StageGroup>

          <StageGroup layer="spark" stage={stage}>
            <SparkLayerContent
              coalGradientId={coalGradId}
              ghostBlurId={ghostBlurId}
            />
          </StageGroup>

          <StageGroup layer="small" stage={stage}>
            <FlameComposite
              shapeFn={flameCandle}
              cx={50}
              baseY={82}
              h={17}
              w={10}
              temp={FLAME_TEMP.small}
              sparkCount={2}
              wisp={false}
              idPrefix={`${id}-small`}
              seedBase={1}
            />
          </StageGroup>

          <StageGroup layer="medium" stage={stage}>
            <FlameComposite
              shapeFn={flameTriTongue}
              cx={50}
              baseY={82}
              h={25}
              w={13}
              temp={FLAME_TEMP.medium}
              sparkCount={4}
              wisp
              idPrefix={`${id}-medium`}
              seedBase={5}
            />
          </StageGroup>

          <StageGroup layer="large" stage={stage}>
            <LargeFlameComposite cx={50} baseY={82} idPrefix={`${id}-large`} />
          </StageGroup>
        </svg>
      </div>
      <p className="font-mono text-sm font-semibold text-gold-accent">
        {stageName} — {filled}/{total}
      </p>
    </div>
  );
}
