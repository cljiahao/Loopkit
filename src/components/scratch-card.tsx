import { cn } from "@/lib/utils";

export function ScratchCard({
  revealed,
  label,
  reward,
  className,
}: {
  revealed: boolean;
  label: string;
  reward: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative h-28 w-48 overflow-hidden rounded-xl border",
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
            "text-sm font-semibold",
            reward ? "text-gold-accent" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground motion-safe:transition-opacity motion-safe:duration-500",
          revealed ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        Scratch to reveal
      </div>
    </div>
  );
}
