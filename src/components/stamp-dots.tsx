import type { CSSProperties, ReactNode } from "react";
import { Check, Gift, Coffee, Star, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export type StampMarkPreset = "gift" | "coffee" | "star" | "heart";
export type StampMark =
  { kind: "preset"; key: StampMarkPreset } | { kind: "photo"; url: string };
export type StampVisualStyle = "dots" | "seal" | "ink" | "punch" | "charm";
type SlotState = "empty" | "filled" | "reward";

const PRESET_ICONS: Record<StampMarkPreset, typeof Gift> = {
  gift: Gift,
  coffee: Coffee,
  star: Star,
  heart: Heart,
};

function slotState(isReward: boolean, stamped: boolean): SlotState {
  if (isReward) return "reward";
  return stamped ? "filled" : "empty";
}

// Shared icon-resolution priority (reward > photo mark > preset mark >
// plain Check > nothing) — the one piece every style, including "dots",
// renders identically; only the slot's own shape/material differs.
function resolveIcon(mark: StampMark | undefined, state: SlotState) {
  if (state === "reward") return <Gift className="size-3.5" />;
  const stamped = state === "filled";
  if (mark?.kind === "photo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={mark.url}
        alt=""
        className={cn(
          "size-full object-cover",
          !stamped && "opacity-40 grayscale",
        )}
      />
    );
  }
  if (mark?.kind === "preset") {
    const PresetIcon = PRESET_ICONS[mark.key];
    return (
      <PresetIcon
        className={cn("size-3.5", !stamped && "opacity-40 grayscale")}
      />
    );
  }
  return stamped ? <Check className="size-3.5" /> : null;
}

// One radial-gradient "dome" formula, parameterized by accent — used by
// both Wax Seal (accent defaults to gold, vendor can override) and Charm
// Trail's coin. Kept as a function rather than a Tailwind class since the
// accent is an arbitrary vendor-picked hex, not a design token.
function domeGradient(accent: string, lightMix: number, darkMix: number) {
  return `radial-gradient(circle at 32% 28%, color-mix(in oklch, ${accent} ${100 - lightMix}%, white ${lightMix}%), ${accent} 55%, color-mix(in oklch, ${accent} ${100 - darkMix}%, black ${darkMix}%) 100%)`;
}

const DOME_SHADOW =
  "inset 0 -2px 3px oklch(0 0 0 / 0.28), inset 0 1.5px 1px oklch(1 0 0 / 0.2), 0 2px 4px -1px oklch(0.22 0.035 28.9 / 0.35)";

const EMPTY_RING = cn(
  "flex size-full items-center justify-center rounded-full border-[1.5px] border-dashed border-muted-foreground/45",
);

type SlotProps = { state: SlotState; accent: string; icon: ReactNode };

function renderSeal({ state, accent, icon }: SlotProps) {
  if (state === "empty") return <span className={EMPTY_RING}>{icon}</span>;
  const isReward = state === "reward";
  return (
    <span
      className="flex size-full items-center justify-center rounded-full text-white"
      style={{
        background: domeGradient(
          isReward ? "var(--color-gold)" : accent,
          12,
          22,
        ),
        boxShadow: DOME_SHADOW,
        // Reward's dome is a light brass, not the dark accent dome — needs
        // the dark reward-foreground ink, not the filled slot's white icon.
        color: isReward ? "var(--color-gold-foreground)" : undefined,
      }}
    >
      {icon}
    </span>
  );
}

function renderInk({ state, accent, icon }: SlotProps) {
  if (state === "empty") return <span className={EMPTY_RING}>{icon}</span>;
  const ink = state === "reward" ? "var(--color-gold)" : accent;
  return (
    <span
      className="flex size-full items-center justify-center rounded-full"
      style={{
        border: `1.5px dashed ${ink}`,
        boxShadow: `inset 0 0 0 4px color-mix(in oklch, ${ink} 12%, transparent)`,
        color: ink,
      }}
    >
      {icon}
    </span>
  );
}

const PUNCH_HATCH =
  "repeating-linear-gradient(-45deg, color-mix(in oklch, var(--color-muted-foreground) 8%, transparent), color-mix(in oklch, var(--color-muted-foreground) 8%, transparent) 2px, transparent 2px, transparent 6px)";

function renderPunch({ state, accent, icon }: SlotProps) {
  if (state === "empty") {
    return (
      <span className={EMPTY_RING} style={{ background: PUNCH_HATCH }}>
        {icon}
      </span>
    );
  }
  const ring =
    state === "reward"
      ? "0 0 0 2px var(--color-gold)"
      : `0 0 0 1.5px color-mix(in oklch, ${accent} 55%, transparent)`;
  return (
    <span
      className="flex size-full items-center justify-center rounded-full bg-background text-muted-foreground"
      style={{
        boxShadow: `inset 0 2px 4px oklch(0.22 0.035 28.9 / 0.32), inset 0 -1px 1px oklch(1 0 0 / 0.5), ${ring}`,
      }}
    >
      {icon}
    </span>
  );
}

function renderCharm({ state, accent, icon }: SlotProps) {
  if (state === "empty") return <span className={EMPTY_RING}>{icon}</span>;
  const isReward = state === "reward";
  return (
    <span
      className="flex size-full items-center justify-center rounded-full"
      style={{
        background: domeGradient(
          isReward ? "var(--color-gold)" : accent,
          25,
          15,
        ),
        boxShadow: DOME_SHADOW,
        color: "var(--color-gold-foreground)",
      }}
    >
      {icon}
    </span>
  );
}

const STYLE_RENDERERS: Record<
  Exclude<StampVisualStyle, "dots">,
  (props: SlotProps) => ReactNode
> = {
  seal: renderSeal,
  ink: renderInk,
  punch: renderPunch,
  charm: renderCharm,
};

// The classic look, unchanged since before styling existed — a single
// span per slot, not the wrapper-plus-material nesting the other 4 styles
// use. Kept separate from STYLE_RENDERERS so "dots" stays pixel-identical.
function DotsSlot({
  state,
  color,
  icon,
}: {
  state: SlotState;
  color?: string;
  icon: ReactNode;
}) {
  let className = "border-dashed border-muted-foreground/30";
  let style: CSSProperties | undefined;
  if (state === "reward") {
    className = "border-gold text-gold-accent";
  } else if (state === "filled") {
    className = "border-transparent bg-gold text-gold-foreground";
    if (color) style = { background: color };
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        "flex size-7 items-center justify-center overflow-hidden rounded-full border-2 text-sm",
        className,
        state === "filled" && "motion-safe:animate-stamp-pop",
      )}
    >
      {state === "reward" ? <Gift className="size-3.5 text-gold" /> : icon}
    </span>
  );
}

export function StampDots({
  filled,
  total,
  mark,
  style = "dots",
  color,
  className,
}: {
  filled: number;
  total: number;
  mark?: StampMark;
  // Vendor-picked skin for each stamp slot. "dots" (default) renders
  // exactly as this component always has, ignoring `color` too — every
  // other style is a full replacement material, not a dots recolor.
  style?: StampVisualStyle;
  // Recolors only the regular filled slots' accent; the reward slot
  // always keeps its own gold/brass identity, same as Wheel/Scratch.
  color?: string;
  className?: string;
}) {
  const accent = color ?? "var(--color-gold)";
  const render = style === "dots" ? null : STYLE_RENDERERS[style];

  return (
    <div className={cn("grid w-fit grid-cols-5 gap-2", className)}>
      {Array.from({ length: total }, (_, i) => {
        const state = slotState(i === total - 1, i < filled);
        const icon = resolveIcon(mark, state);
        if (!render) {
          return <DotsSlot key={i} state={state} color={color} icon={icon} />;
        }
        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "flex size-7 items-center justify-center overflow-hidden rounded-full text-sm",
              state === "filled" && "motion-safe:animate-stamp-pop",
            )}
          >
            {render({ state, accent, icon })}
          </span>
        );
      })}
    </div>
  );
}
