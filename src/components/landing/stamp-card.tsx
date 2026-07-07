import { Check, Gift } from "lucide-react";
import { cn } from "@/lib/utils";

// 8-slot card: 6 stamped, the 8th is the reward. The hero thesis — the small
// joy of a nearly-finished card. Pure markup, no image, renders in the HTML.
const TOTAL = 8;
const STAMPED = 6;

export function StampCard() {
  return (
    <div
      aria-hidden
      className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm"
    >
      <div className="flex items-baseline justify-between">
        <span className="font-display text-base font-bold">Kaya Toast Co.</span>
        <span className="font-mono text-xs text-muted-foreground">
          buy 8, get 1 free
        </span>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-3">
        {Array.from({ length: TOTAL }).map((_, i) => {
          const isReward = i === TOTAL - 1;
          const stamped = i < STAMPED;
          return (
            <div
              key={i}
              className={cn(
                "flex aspect-square items-center justify-center rounded-full border-2 text-sm",
                isReward
                  ? "border-gold text-gold-foreground"
                  : stamped
                    ? "border-transparent bg-gold text-gold-foreground"
                    : "border-dashed border-border text-muted-foreground/40",
              )}
            >
              {isReward ? (
                <Gift className="size-4 text-gold" />
              ) : stamped ? (
                <Check className="size-4" />
              ) : (
                <span className="font-mono text-xs">{i + 1}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        2 more to a{" "}
        <span className="font-medium text-foreground">free kopi</span>.
      </p>
    </div>
  );
}
