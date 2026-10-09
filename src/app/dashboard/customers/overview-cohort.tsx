import Link from "next/link";
import { ElevatedCard } from "@merqo/ui";
import { listCards } from "@/lib/cards";
import { getVendorOverviewInputs } from "@/lib/stats";
import {
  overviewCohortCardIds,
  type OverviewCohort,
} from "@/lib/overview-cohorts";
import type { Program } from "@/lib/program";
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const titles: Record<OverviewCohort, string> = {
  "gone-quiet": "Regulars gone quiet",
  "one-away": "One stamp from a reward",
  "two-away": "Two stamps from a reward",
};

export async function OverviewCohortList({
  programs,
  cohort,
  p,
  q,
}: {
  programs: Program[];
  cohort: OverviewCohort;
  p?: string;
  q?: string;
}) {
  const selected = p
    ? programs.filter((program) => program.id === p)
    : programs;
  const inputs = await getVendorOverviewInputs(
    selected.map((program) => program.id),
  );
  const ids = overviewCohortCardIds(
    cohort,
    selected,
    inputs,
    new Date().getTime(),
  );
  const matches = (
    await Promise.all(
      selected.map(async (program) => ({
        program,
        cards:
          ids.size === 0
            ? []
            : (await listCards(program.id, q)).filter((card) =>
                ids.has(card.id),
              ),
      })),
    )
  ).flatMap(({ program, cards }) => cards.map((card) => ({ program, card })));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{titles[cohort]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {matches.length} matching cards across the selected programs.
        </p>
      </div>
      <ProgramSwitcher
        programs={programs}
        currentId={p ?? ""}
        basePath="/dashboard/customers"
      />
      <form action="/dashboard/customers" className="flex gap-3">
        <input type="hidden" name="cohort" value={cohort} />
        {p && <input type="hidden" name="p" value={p} />}
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by phone"
          aria-label="Search by phone"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching cards.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {matches.map(({ program, card }) => (
            <ElevatedCard
              as="li"
              key={card.id}
              className="space-y-2 p-3 text-sm"
            >
              <Link
                className="font-medium hover:underline"
                href={"/dashboard/customers/" + encodeURIComponent(card.phone)}
              >
                {card.phone}
              </Link>
              <p>{program.name}</p>
              <Link
                className="hover:underline"
                href={
                  "/dashboard/counter?p=" +
                  encodeURIComponent(program.id) +
                  "&phone=" +
                  encodeURIComponent(card.phone)
                }
              >
                Serve
              </Link>
            </ElevatedCard>
          ))}
        </ul>
      )}
      <Link href="/dashboard/customers" className="text-sm hover:underline">
        All customers
      </Link>
    </div>
  );
}
