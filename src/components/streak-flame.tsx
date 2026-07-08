import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export function StreakFlame({
  current,
  target,
  status,
  className,
}: {
  current: number;
  target: number;
  status: "active" | "grace" | "broken" | "none";
  className?: string;
}) {
  const colorClass =
    status === "active"
      ? "text-gold-accent"
      : status === "grace"
        ? "text-amber-500"
        : "text-muted-foreground opacity-50";

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <Flame className={cn("size-16", colorClass)} aria-hidden="true" />
      <p className={cn("font-mono text-sm font-semibold", colorClass)}>
        {current} / {target} week streak
      </p>
    </div>
  );
}
