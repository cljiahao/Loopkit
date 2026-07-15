import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const innerLit = stage >= 1;
  const outerLit = stage >= 2;
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative flex size-16 items-center justify-center">
        <Flame
          className={cn(
            "absolute size-16 text-amber-500/40 transition-opacity",
            outerLit ? "opacity-100" : "opacity-0",
          )}
          aria-hidden="true"
        />
        <Flame
          className={cn(
            "relative size-10 transition-colors",
            innerLit ? "text-gold-accent" : "text-muted-foreground opacity-50",
          )}
          aria-hidden="true"
        />
      </div>
      <p className="font-mono text-sm font-semibold text-gold-accent">
        {stageName} — {filled}/{total}
      </p>
    </div>
  );
}
