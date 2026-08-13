import { formatShortDate } from "@/lib/format";

/**
 * 30-day visits bar chart shared by both branches of `StatsPage` (all
 * programs / single program) — previously ~110 lines duplicated verbatim
 * between the two. A `border-t` baseline anchors the bars, and first/last
 * date labels give the chart a visible axis (the per-bar `title` tooltip
 * alone is invisible on touch, the primary device per PRODUCT.md).
 */
export function VisitsChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  const maxDay = Math.max(1, ...data.map((d) => d.count));
  const first = data[0];
  const last = data[data.length - 1];

  return (
    <div>
      <div className="flex h-24 items-end gap-[3px]">
        {data.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.count}`}
            className="flex-1 rounded-t bg-primary/70"
            style={{
              height: `${Math.max(4, (d.count / maxDay) * 100)}%`,
            }}
          />
        ))}
      </div>
      <div className="border-t border-border" />
      {first && last && (
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{formatShortDate(first.date)}</span>
          <span>{formatShortDate(last.date)}</span>
        </div>
      )}
    </div>
  );
}
