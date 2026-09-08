import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { WorthALookItem } from "@/app/dashboard/dashboard-view";

type Row = {
  href: string;
  tone: "warn" | "gold";
  strong: string;
  sub: string;
};

function toRow(item: WorthALookItem): Row {
  if (item.kind === "gone-quiet") {
    const noun = item.count === 1 ? "regular has" : "regulars have";
    return {
      href: "/dashboard/customers?seg=lapsed",
      tone: "warn",
      strong: `${item.count} ${noun} gone quiet`,
      sub: "Weekly customers, not in for about three weeks. A message brings most back.",
    };
  }
  if (item.kind === "one-away") {
    return {
      href: "/dashboard/customers?seg=ready",
      tone: "gold",
      strong: `${item.count} ${item.count === 1 ? "is" : "are"} one stamp from a reward`,
      sub: "They will be in soon to claim it. A planned cost, and a near-certain visit.",
    };
  }
  return {
    href: "/dashboard/customers?seg=ready",
    tone: "gold",
    strong: `${item.count} ${item.count === 1 ? "is" : "are"} two stamps away`,
    sub: "Close enough to nudge.",
  };
}

export function WorthALook({ items }: { items: WorthALookItem[] }) {
  if (items.length === 0) return null;
  const rows = items.map(toRow);

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        Worth a look
      </h2>
      {rows.map((row) => (
        <Link
          key={row.href + row.strong}
          href={row.href}
          className={`group flex items-start gap-3 rounded-xl border p-3 transition-colors hover:border-foreground/25 ${
            row.tone === "warn"
              ? "border-gold/45 bg-gold/[0.08]"
              : "border-border bg-card"
          }`}
        >
          <span
            className={`mt-1.5 size-2 shrink-0 rounded-full ${
              row.tone === "gold" || row.tone === "warn"
                ? "bg-gold"
                : "bg-muted-foreground"
            }`}
          />
          <span className="flex min-w-0 flex-col gap-0.5">
            <strong className="text-sm font-bold">{row.strong}</strong>
            <span className="text-xs leading-relaxed text-muted-foreground">
              {row.sub}
            </span>
          </span>
          <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </section>
  );
}
