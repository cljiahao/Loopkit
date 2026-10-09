import { cn } from "@/lib/utils";
import { ElevatedCard, StatTile } from "@merqo/ui";

/** A back-office figure tile: a small uppercase label over a big value. */
export function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <ElevatedCard className={cn("p-4", className)}>
      <StatTile
        label={label}
        value={String(value)}
        className="gap-0"
        labelClassName="text-xs"
        valueClassName="mt-1 text-2xl font-bold tabular-nums leading-8 overflow-visible whitespace-normal text-clip"
      />
    </ElevatedCard>
  );
}
