import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Lucky Tap's mystery-box visual — a "tap for a surprise" prompt, not a
// stamp-style dot grid — since it's now grouped with Wheel/Scratch as a
// Chance-family style (src/app/setup/card-type-picker.ts): all three are
// random-draw-per-visit mechanics and should read as the same kind of card.
// The pity-ceiling progress stays visible as a small caption underneath so
// the guaranteed-win-by information isn't lost, just no longer the primary
// visual.
export function LuckyBox({
  visitsSinceWin,
  pityCeiling,
  className,
}: {
  visitsSinceWin: number;
  pityCeiling: number;
  className?: string;
}) {
  const progress = Math.min(visitsSinceWin, pityCeiling);
  return (
    <div
      className={cn(
        "relative flex h-28 w-28 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border bg-primary/10",
        className,
      )}
    >
      {/* Idle shimmer inviting the tap — LuckyBox previously had no
          animation at all; a soft light sweep gives it some life even
          before a customer interacts with it. Skipped under
          reduced-motion via the CSS override in globals.css. */}
      <div
        aria-hidden="true"
        className="lucky-box-shimmer pointer-events-none absolute inset-y-0 left-1/2 w-1/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-primary/25 to-transparent"
      />
      <Sparkles className="relative size-8 text-primary" aria-hidden="true" />
      <p className="relative text-xs font-semibold text-primary">
        Tap for a surprise
      </p>
      <p className="relative text-center text-[0.65rem] text-muted-foreground">
        Guaranteed win by visit {progress}/{pityCeiling}
      </p>
    </div>
  );
}
