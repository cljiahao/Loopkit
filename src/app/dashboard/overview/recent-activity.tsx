import Link from "next/link";
import { Gift, Stamp, UserPlus } from "lucide-react";
import type { VendorActivityRow } from "@/lib/activity";
import { formatSgtDateTime } from "@/lib/format";
import { maskPhone } from "@/lib/phone";

function mark(row: VendorActivityRow) {
  if (row.isReward) return { Icon: Gift, cls: "bg-gold/20 text-gold-accent" };
  if (row.kind === "first-visit" || row.label === "First visit") {
    return { Icon: UserPlus, cls: "bg-emerald-500/15 text-emerald-600" };
  }
  return { Icon: Stamp, cls: "bg-primary/10 text-primary" };
}

export function RecentActivity({
  rows,
  programIdByName = {},
}: {
  rows: VendorActivityRow[];
  programIdByName?: Record<string, string>;
}) {
  const shown = rows.slice(0, 6);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Recent activity
        </h2>
        <Link
          href="/dashboard/activity"
          className="text-sm font-semibold text-primary"
        >
          Activity
        </Link>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet today.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((row) => {
            const { Icon, cls } = mark(row);
            const programId = programIdByName[row.programName];
            return (
              <li
                key={row.id}
                className="flex items-center gap-3 rounded-xl border bg-card p-3"
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full ${cls}`}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm">
                    {maskPhone(row.phone)}
                  </span>
                  <span className="block truncate text-xs capitalize text-muted-foreground">
                    {row.label} &middot; {row.programName}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[0.7rem] text-muted-foreground">
                  {formatSgtDateTime(row.createdAt)}
                </span>
                {!row.isReward && programId && (
                  <Link
                    href={`/dashboard/counter?p=${programId}&phone=${encodeURIComponent(row.phone)}`}
                    className="shrink-0 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary"
                  >
                    Serve
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
