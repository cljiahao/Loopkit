import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const FLAME_COLORS = [
  "text-yellow-400",
  "text-orange-500",
  "text-red-500/85",
] as const;
const FLAME_SIZES = ["", "size-6", "size-8", "size-11", "size-14"] as const;

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
  const iconCount = stage <= 1 ? stage : 3;
  const size = FLAME_SIZES[stage] ?? FLAME_SIZES[1];
  const logCount = stage >= 4 ? 3 : 2;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        data-flame-stage={stage}
        className="flex size-16 flex-col items-center justify-end gap-1 pb-1"
      >
        <div
          className={cn(
            "relative flex size-14 items-center justify-center",
            iconCount > 0 && "motion-safe:animate-flame-flicker",
          )}
        >
          {stage === 0 && (
            <span
              data-flame-coal="true"
              aria-hidden="true"
              className="absolute size-2 rounded-full bg-red-900/70"
            />
          )}
          {Array.from({ length: iconCount }, (_, i) => (
            <Flame
              key={i}
              aria-hidden="true"
              className={cn(
                "absolute",
                size,
                iconCount === 1
                  ? "text-amber-400/50"
                  : FLAME_COLORS[i % FLAME_COLORS.length],
              )}
            />
          ))}
        </div>
        <div aria-hidden="true" className="flex gap-0.5">
          {Array.from({ length: logCount }, (_, i) => (
            <span
              key={i}
              data-flame-log="true"
              className="h-1.5 w-6 rounded-full bg-[oklch(0.35_0.06_50)]"
            />
          ))}
        </div>
      </div>
      <p className="font-mono text-sm font-semibold text-gold-accent">
        {stageName} — {filled}/{total}
      </p>
    </div>
  );
}
