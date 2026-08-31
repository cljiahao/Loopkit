import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

const SOIL_Y = 74;
// The stem's own full-length endpoint (never reached — later stages target
// a shorter, stage-specific top so the flower head lands where the bud sits).
const STEM_FULL_Y = 14;
const SAPLING_TOP_Y = 46;
// Where the bud sits, where the stem's growth targets at Budding, and the
// exact anchor the bloom group grows out of — all three share this one
// point so the flower reads as opening "out of" the bud, not next to it.
const BUD_ANCHOR_Y = 24;
// Blooming keeps growing the stem a touch past the bud anchor, so the
// flower head reads as sitting just proud of the stem tip.
const BLOOM_STEM_TOP_Y = 20;
// Must match GROWTH_TRANSITION's duration-[1600ms] below — the bud's
// fade-out is deliberately delayed by this same amount so it disappears
// only once the bloom has visually grown in over it ("absorbed", not two
// things fading independently of each other).
const STEM_GROWTH_MS = 1600;
const GROWTH_TRANSITION =
  "motion-safe:transition-all motion-safe:duration-[1600ms] motion-safe:ease-out";

// Indexed by clamped stage (0-4) — plain lookup tables instead of a nested
// ternary chain, both for readability and to keep Plant()'s own cognitive
// complexity down.
const LEAVES_VISIBLE_BY_STAGE = [0, 0, 3, 4, 5] as const;
const STEM_TOP_Y_BY_STAGE = [
  SOIL_Y,
  SOIL_Y,
  SAPLING_TOP_Y,
  BUD_ANCHOR_Y,
  BLOOM_STEM_TOP_Y,
] as const;

// 5 persistent leaf slots at fixed positions along the stem, reused
// unchanged from Sapling through Blooming — each stage only reveals more of
// them via opacity/scale, they're never swapped for a different set.
const LEAF_SLOTS = [
  { y: 62, angle: -52, w: 6.5, h: 15 },
  { y: 54, angle: 56, w: 5.5, h: 12.5 },
  { y: 46, angle: -45, w: 4.2, h: 9 },
  { y: 39, angle: 42, w: 3.5, h: 7.5 },
  { y: 30, angle: -40, w: 3, h: 6.5 },
] as const;

function leafPath(w: number, h: number) {
  return `M0 0 C${-w} ${-h * 0.35} ${-w} ${-h * 0.75} 0 ${-h} C${w} ${-h * 0.75} ${w} ${-h * 0.35} 0 0 Z`;
}

// Rounded, broad-bodied petal (not a thin ellipse spoke). notch=true gives
// a shallow heart-tip dip (used by the sakura and pansy blooms).
function petalPath(len: number, width: number, notch: boolean) {
  const w = width;
  const l = len;
  if (notch) {
    return `M0 0 C${-w} ${-l * 0.15} ${-w * 1.02} ${-l * 0.55} ${-w * 0.4} ${-l * 0.85} C${-w * 0.22} ${-l * 0.78} ${-w * 0.08} ${-l * 0.92} 0 ${-l * 0.78} C${w * 0.08} ${-l * 0.92} ${w * 0.22} ${-l * 0.78} ${w * 0.4} ${-l * 0.85} C${w * 1.02} ${-l * 0.55} ${w} ${-l * 0.15} 0 0 Z`;
  }
  return `M0 0 C${-w} ${-l * 0.15} ${-w * 1.02} ${-l * 0.55} ${-w * 0.35} ${-l * 0.82} C${-w * 0.12} ${-l * 0.95} ${w * 0.12} ${-l * 0.95} ${w * 0.35} ${-l * 0.82} C${w * 1.02} ${-l * 0.55} ${w} ${-l * 0.15} 0 0 Z`;
}

type BloomProps = { wilting: boolean };

function Petal({
  len,
  width,
  rot,
  notch = false,
  opacity = 1,
  wilting,
}: {
  len: number;
  width: number;
  rot: number;
  notch?: boolean;
  opacity?: number;
  wilting: boolean;
}) {
  return (
    <path
      d={petalPath(len, width, notch)}
      transform={`rotate(${rot})`}
      opacity={opacity}
      className={wilting ? "fill-muted-foreground" : "fill-gold"}
    />
  );
}

function TulipBloom({ wilting }: BloomProps) {
  const rotations = [-28, -13, 0, 13, 28];
  return (
    <>
      {rotations.map((rot, i) => (
        <Petal
          key={rot}
          len={17}
          width={5.5}
          rot={rot}
          opacity={i === 2 ? 0.9 : 1}
          wilting={wilting}
        />
      ))}
      <ellipse cx="-1.5" cy="-9" rx="1.4" ry="4" fill="white" opacity="0.2" />
    </>
  );
}

// Fixed decorative jitter standing in for the reference's per-anther random
// offset — a customer's flower must render identically every time, so this
// can't be Math.random() per render.
const DAISY_ANTHER_JITTER = [-0.5, 0.6, -0.3, 0.4, -0.6];

function DaisyBloom({ wilting }: BloomProps) {
  return (
    <>
      {[0, 72, 144, 216, 288].map((rot) => (
        <Petal key={rot} len={16} width={8} rot={rot} wilting={wilting} />
      ))}
      <line
        x1="0"
        y1="0"
        x2="0"
        y2="-15"
        stroke="currentColor"
        strokeWidth="0.7"
      />
      {DAISY_ANTHER_JITTER.map((jitter, i) => (
        <circle
          key={i}
          cx={jitter}
          cy={-16.5 - i * 0.6}
          r="0.7"
          className={wilting ? "fill-muted-foreground" : "fill-gold"}
        />
      ))}
      <circle r="1.8" fill="currentColor" />
    </>
  );
}

// Real sakura blossoms open in small clusters along a branch, not as one big
// single flower — this is 3 small blossoms sharing one attach point.
function SakuraBlossom({
  cx,
  cy,
  scale,
  wilting,
}: { cx: number; cy: number; scale: number } & BloomProps) {
  return (
    <g transform={`translate(${cx},${cy})`}>
      {[0, 72, 144, 216, 288].map((rot) => (
        <Petal
          key={rot}
          len={9 * scale}
          width={5 * scale}
          rot={rot}
          notch
          wilting={wilting}
        />
      ))}
      {[0, 60, 120, 180, 240, 300].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return (
          <circle
            key={deg}
            cx={Math.cos(rad) * 2 * scale}
            cy={Math.sin(rad) * 2 * scale}
            r={0.4 * scale}
            className={wilting ? "fill-muted-foreground" : "fill-gold"}
          />
        );
      })}
      <circle
        r={1.1 * scale}
        className={wilting ? "fill-muted-foreground" : "fill-gold"}
      />
    </g>
  );
}

function SakuraBloom({ wilting }: BloomProps) {
  return (
    <>
      <path
        d="M0 0 C0 -4 -3 -6 -6 -7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M0 0 C0 -5 3 -8 6 -9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M0 0 C0 -3 0 -6 0 -10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <SakuraBlossom cx={-6} cy={-7} scale={0.85} wilting={wilting} />
      <SakuraBlossom cx={6} cy={-9} scale={0.9} wilting={wilting} />
      <SakuraBlossom cx={0} cy={-10} scale={1} wilting={wilting} />
    </>
  );
}

function PansyBloom({ wilting }: BloomProps) {
  return (
    <>
      {[-130, 130].map((rot) => (
        <Petal
          key={rot}
          len={10}
          width={6}
          rot={rot}
          notch
          opacity={0.9}
          wilting={wilting}
        />
      ))}
      {[-35, 0, 35].map((rot) => (
        <Petal key={rot} len={13} width={7.5} rot={rot} wilting={wilting} />
      ))}
      <path
        d="M-2.5 -1 C-1 1.5 1 1.5 2.5 -1 C1 0 -1 0 -2.5 -1 Z"
        fill="currentColor"
        opacity="0.7"
      />
      <circle
        r="1.3"
        className={wilting ? "fill-muted-foreground" : "fill-gold"}
      />
    </>
  );
}

// Four random-per-customer bloom types — final approved set. Do not add
// other flower types (rose/poppy/sunflower/lily/carnation/morning glory
// were tried and explicitly rejected) — only these 4 survived review.
const BLOOM_TYPES: Array<(props: BloomProps) => ReactElement> = [
  TulipBloom,
  DaisyBloom,
  SakuraBloom,
  PansyBloom,
];

// Deterministic — the same seed must always render the same bloom type, or
// a customer's flower would flicker to a different type on every reload.
// Trivial hash, not cryptographic.
function hashSeedToBloomIndex(seed: string | number | undefined): number {
  if (seed === undefined) return 0;
  if (typeof seed === "number") {
    return Math.abs(Math.trunc(seed)) % BLOOM_TYPES.length;
  }
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return sum % BLOOM_TYPES.length;
}

export function Plant({
  stage,
  totalStages,
  wilting,
  className,
  seed,
}: {
  stage: number;
  totalStages: number;
  wilting: boolean;
  className?: string;
  seed?: string | number;
}) {
  const isBloom = stage >= totalStages - 1 && totalStages > 1;
  const showSeed = stage === 0;
  const showHook = stage === 1;
  // Mounted from Budding onward so it can persist, full opacity, into
  // Blooming — it only fades out (on a delay) once the bloom has grown in
  // over it, rather than disappearing the instant the bloom appears.
  const showBud = stage >= 3;
  const budFading = stage >= 4;
  const clampedStage = Math.min(Math.max(stage, 0), 4);
  const leavesVisibleCount = LEAVES_VISIBLE_BY_STAGE[clampedStage];
  const stemTopY = STEM_TOP_Y_BY_STAGE[clampedStage];
  const stemFrac = (SOIL_Y - stemTopY) / (SOIL_Y - STEM_FULL_Y);

  const Bloom = BLOOM_TYPES[hashSeedToBloomIndex(seed)];

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
      <ellipse
        cx="50"
        cy="90"
        rx="26"
        ry="4"
        className="fill-muted-foreground/15"
      />
      <path
        d="M32 74 h36 l-4 16 a2 2 0 0 1 -2 2 h-24 a2 2 0 0 1 -2 -2 z"
        className="fill-primary/25 stroke-primary/40"
        strokeWidth="1.5"
      />
      <rect
        x="30"
        y="70"
        width="40"
        height="6"
        rx="2"
        className="fill-primary/35"
      />
      <g
        style={{
          transformOrigin: "50px 74px",
          transform: wilting ? "rotate(9deg)" : "none",
        }}
        className="motion-safe:transition-transform motion-safe:duration-500"
      >
        <line
          x1="50"
          y1={SOIL_Y}
          x2="50"
          y2={STEM_FULL_Y}
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          style={{
            transformOrigin: `50px ${SOIL_Y}px`,
            transform: `scaleY(${stemFrac})`,
          }}
          className={GROWTH_TRANSITION}
        />
        <circle
          data-plant-seed="true"
          cx="50"
          cy="70"
          r="3.5"
          fill="currentColor"
          style={{ transformOrigin: "50px 70px" }}
          className={cn(
            GROWTH_TRANSITION,
            "opacity-60",
            showSeed ? "scale-100" : "scale-0 opacity-0",
          )}
        />
        <path
          data-plant-hook="true"
          d="M50 74 C50 68 46 65 47 60 C47.6 57.5 50 57 51 59"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className={cn(
            "motion-safe:transition-opacity motion-safe:duration-500",
            showHook ? "opacity-100" : "opacity-0",
          )}
        />
        {LEAF_SLOTS.map((leaf, i) => {
          const visible = i < leavesVisibleCount;
          return (
            <g
              key={i}
              data-plant-leaf="true"
              style={{ transformOrigin: `50px ${leaf.y}px` }}
              className={cn(
                GROWTH_TRANSITION,
                visible ? "opacity-100 scale-100" : "opacity-0 scale-0",
              )}
            >
              <path
                d={leafPath(leaf.w, leaf.h)}
                transform={`rotate(${leaf.angle})`}
                fill="currentColor"
              />
              <line
                x1="0"
                y1="-2"
                x2="0"
                y2={-leaf.h + 2}
                stroke="black"
                strokeWidth="0.5"
                opacity="0.18"
              />
            </g>
          );
        })}
        {showBud && (
          <g
            data-plant-bud="true"
            style={{
              transformOrigin: `50px ${BUD_ANCHOR_Y}px`,
              transitionDelay: budFading ? `${STEM_GROWTH_MS}ms` : undefined,
            }}
            className={cn(
              GROWTH_TRANSITION,
              "scale-50",
              budFading
                ? "opacity-0"
                : "opacity-100 starting:opacity-0 starting:scale-0",
            )}
          >
            <ellipse
              cx="50"
              cy={BUD_ANCHOR_Y}
              rx="6.5"
              ry="2.2"
              className="fill-muted-foreground/15"
            />
            <path
              d="M50 24 C44 24 41 18 41 12 C41 7 45 2 50 0 C55 2 59 7 59 12 C59 18 56 24 50 24 Z"
              className={cn(
                wilting ? "fill-muted-foreground" : "fill-gold",
                "stroke-current",
              )}
              strokeWidth="1"
            />
          </g>
        )}
        {isBloom && (
          <g
            data-plant-bloom="true"
            style={{ transformOrigin: `50px ${BUD_ANCHOR_Y}px` }}
            className={cn(
              GROWTH_TRANSITION,
              "opacity-100 scale-100 starting:opacity-0 starting:scale-0",
            )}
          >
            <g transform={`translate(50,${BUD_ANCHOR_Y})`}>
              <Bloom wilting={wilting} />
            </g>
          </g>
        )}
      </g>
    </svg>
  );
}
