import { formatShortDate } from "@/lib/format";

export function VisitsBars({
  data,
  priorCount = 0,
  axisClassName = "",
  rawDateTitles = false,
}: {
  data: { date: string; count: number }[];
  priorCount?: number;
  axisClassName?: string;
  rawDateTitles?: boolean;
}) {
  const max = Math.max(1, ...data.map((bar) => bar.count));
  const first = data[0];
  const last = data[data.length - 1];
  return (
    <>
      <div className="flex h-24 items-end gap-[3px]">
        {data.map((bar, index) => (
          <div
            key={bar.date}
            title={`${rawDateTitles ? bar.date : formatShortDate(bar.date)}: ${bar.count}`}
            className={`flex-1 rounded-t ${index < priorCount ? "bg-primary/30" : "bg-primary/70"}`}
            style={{ height: `${Math.max(4, (bar.count / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="border-t border-border" />
      {first && last && (
        <div
          className={`flex justify-between text-[10px] text-muted-foreground ${axisClassName}`}
        >
          <span>{formatShortDate(first.date)}</span>
          <span>{formatShortDate(last.date)}</span>
        </div>
      )}
    </>
  );
}
