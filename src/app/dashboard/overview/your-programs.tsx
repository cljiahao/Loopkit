import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import type { OverviewProgram } from "@/app/dashboard/dashboard-view";

const SEED = [
  "bg-primary",
  "bg-gold",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
];

export function YourPrograms({ programs }: { programs: OverviewProgram[] }) {
  if (programs.length < 2) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Your programs
        </h2>
        <Link href="/setup" className="text-sm font-semibold text-primary">
          Manage
        </Link>
      </div>

      {programs.map((program, i) => (
        <div
          key={program.id}
          className="flex items-center gap-3 rounded-xl border bg-card p-3"
        >
          <span
            className={`size-2 shrink-0 rounded-full ${SEED[i % SEED.length]}`}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-semibold">{program.name}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {program.returnRate === null
                ? "not enough data"
                : `${Math.round(program.returnRate * 100)}% come back`}
            </span>
          </div>
          <Link
            href={`/setup?id=${program.id}`}
            aria-label={`Edit ${program.name}`}
            className="grid size-8 shrink-0 place-items-center rounded-md border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Pencil className="size-3.5" />
          </Link>
          <Link
            href={`/dashboard/counter?p=${program.id}`}
            className="shrink-0 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary"
          >
            Serve
          </Link>
        </div>
      ))}

      <Link
        href="/setup"
        className="flex items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/45 p-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="size-3.5" />
        Add another program
      </Link>
    </section>
  );
}
