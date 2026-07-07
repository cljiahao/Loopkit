import { cn } from "@/lib/utils";

/** loopkit wordmark. The "oo" are two gold stamp dots — the reward motif that
 *  runs through the brand. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-lg font-extrabold lowercase tracking-tight",
        className,
      )}
    >
      l
      <span className="text-gold" aria-hidden>
        oo
      </span>
      pkit
    </span>
  );
}
