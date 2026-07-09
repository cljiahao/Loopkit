import Link from "next/link";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline pill pointing a free-tier vendor at the plan page from wherever they
 * hit a Pro-only limit. Mirrors qkit's ProLock — one visual pattern reused at
 * every point of friction instead of a blur/modal treatment.
 */
export function ProLock({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <Link
      href="/dashboard/plan"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10",
        className,
      )}
    >
      <Lock className="size-3" />
      {label}
    </Link>
  );
}
