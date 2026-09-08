"use client";

import { useEffect, useState } from "react";
import { formatShortDate } from "@/lib/format";
import type { TrendBar } from "@/app/dashboard/dashboard-view";

const WIDE = "(min-width: 56rem)";

function Bar({
  bar,
  muted,
  max,
}: {
  bar: TrendBar;
  muted: boolean;
  max: number;
}) {
  return (
    <div
      title={`${formatShortDate(bar.date)}: ${bar.count}`}
      className={`flex-1 rounded-t ${muted ? "bg-primary/30" : "bg-primary/70"}`}
      style={{ height: `${Math.max(4, (bar.count / max) * 100)}%` }}
    />
  );
}

export function VisitsTrend({
  bars7,
  bars14,
  deltaVsLastWeek,
}: {
  bars7: TrendBar[];
  bars14: TrendBar[];
  deltaVsLastWeek: number;
}) {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const bars = wide ? bars14 : bars7;
  const priorCount = wide ? bars14.length - 7 : 0;
  const max = Math.max(1, ...bars.map((b) => b.count));
  const first = bars[0];
  const last = bars[bars.length - 1];

  let deltaText: string | null = null;
  if (deltaVsLastWeek > 0) deltaText = `up ${deltaVsLastWeek} vs last week`;
  else if (deltaVsLastWeek < 0)
    deltaText = `down ${Math.abs(deltaVsLastWeek)} vs last week`;

  return (
    <figure className="m-0 flex w-full max-w-[37rem] flex-col gap-2">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        <span>Visits, last {wide ? 14 : 7} days</span>
        {deltaText && (
          <span className="text-emerald-600 dark:text-emerald-400">
            {deltaText}
          </span>
        )}
      </figcaption>
      <div className="flex h-24 items-end gap-[3px]">
        {bars.map((bar, i) => (
          <Bar key={bar.date} bar={bar} muted={i < priorCount} max={max} />
        ))}
      </div>
      <div className="border-t border-border" />
      {first && last && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{formatShortDate(first.date)}</span>
          <span>{formatShortDate(last.date)}</span>
        </div>
      )}
    </figure>
  );
}
