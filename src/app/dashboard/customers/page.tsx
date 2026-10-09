import Link from "next/link";
import { redirect } from "next/navigation";
import { requireVendor } from "@/features/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { getProgress } from "@/lib/engine";
import { listCards } from "@/lib/cards";
import { listVendorCustomers } from "@/lib/customers";
import {
  parseSegment,
  parseSort,
  segmentCounts,
  filterBySegment,
  sortCustomers,
  CUSTOMER_SEGMENTS,
  type CustomerSegment,
} from "@/lib/customer-segments";
import { formatSgtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

import { ElevatedCard } from "@merqo/ui";
import { ProgramSwitcher } from "@/app/dashboard/program-switcher";
import { VendorCustomerList } from "./vendor-customer-list";
import { CustomerControls } from "./customer-controls";
import { OverviewCohortList } from "./overview-cohort";
import { parseOverviewCohort } from "@/lib/overview-cohorts";

type CustomersPageProps = {
  searchParams: Promise<{
    q?: string;
    p?: string;
    seg?: string;
    sort?: string;
    cohort?: string;
  }>;
};

const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  all: "All",
  ready: "Reward ready",
  new: "New this week",
  lapsed: "Not seen 30d+",
};

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const {
    q,
    p,
    seg: segRaw,
    sort: sortRaw,
    cohort: cohortRaw,
  } = await searchParams;
  const cohort = parseOverviewCohort(cohortRaw);
  if (cohort) return OverviewCohortList({ programs, cohort, p, q });

  if (!p && !segRaw && !sortRaw && programs.length === 1) {
    const qSuffix = q ? `&q=${encodeURIComponent(q)}` : "";
    redirect(`/dashboard/customers?p=${programs[0].id}${qSuffix}`);
  }

  if (!p) {
    const seg = parseSegment(segRaw);
    const sort = parseSort(sortRaw);
    const nowMs = new Date().getTime();
    const all = await listVendorCustomers(q);
    const counts = segmentCounts(all, nowMs);
    const customers = sortCustomers(filterBySegment(all, seg, nowMs), sort);

    const chipHref = (value: CustomerSegment) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      params.set("seg", value);
      params.set("sort", sort);
      return `/dashboard/customers?${params.toString()}`;
    };

    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who has a card at your shop, across every program.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-auto">
            <ProgramSwitcher
              programs={programs}
              currentId=""
              basePath="/dashboard/customers"
            />
          </div>
          <form
            className="flex w-full min-w-0 flex-1 items-center gap-3 sm:w-auto"
            action="/dashboard/customers"
          >
            <Label htmlFor="customers-search-vendor" className="sr-only">
              Search by phone
            </Label>
            <Input
              id="customers-search-vendor"
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search by phone"
              className="h-11 min-w-0 rounded-xl"
            />
            <Button
              type="submit"
              variant="outline"
              className="h-11 shrink-0 rounded-xl px-6"
            >
              Search
            </Button>
          </form>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {CUSTOMER_SEGMENTS.map((value) => (
            <Link
              key={value}
              href={chipHref(value)}
              aria-current={seg === value ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                seg === value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {SEGMENT_LABELS[value]} {counts[value]}
            </Link>
          ))}
          <div className="ml-auto">
            <CustomerControls sort={sort} preservedParams={{ q, seg }} />
          </div>
        </div>
        <VendorCustomerList customers={customers} />
      </div>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const cards = await listCards(program.id, q);
  const now = new Date();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has a {program.name} card.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-auto">
          <ProgramSwitcher
            programs={programs}
            currentId={program.id}
            basePath="/dashboard/customers"
          />
        </div>
        <form
          className="flex w-full min-w-0 flex-1 items-center gap-3 sm:w-auto"
          action="/dashboard/customers"
        >
          <input type="hidden" name="p" value={program.id} />
          <Label htmlFor="customers-search-program" className="sr-only">
            Search by phone
          </Label>
          <Input
            id="customers-search-program"
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by phone"
            className="h-11 min-w-0 rounded-xl"
          />
          <Button
            type="submit"
            variant="outline"
            className="h-11 shrink-0 rounded-xl px-6"
          >
            Search
          </Button>
        </form>
      </div>

      {cards.length === 0 ? (
        <ElevatedCard className="p-6">
          <p className="text-sm text-muted-foreground">No customers yet.</p>
        </ElevatedCard>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <ElevatedCard
              as="li"
              key={card.id}
              className="flex items-center justify-between gap-3 p-3 text-sm"
            >
              <div className="min-w-0">
                <Link
                  href={`/dashboard/customers/${encodeURIComponent(card.phone)}`}
                  className="font-medium hover:underline"
                >
                  {card.phone}
                </Link>
                <p className="mt-0.5 truncate text-muted-foreground">
                  {
                    getProgress(
                      program,
                      {
                        state: card.state,
                        stamp_count: card.stamp_count,
                        reward_count: card.reward_count,
                      },
                      now,
                    ).label
                  }
                  {card.reward_count > 0 &&
                    ` · ${card.reward_count} reward${card.reward_count === 1 ? "" : "s"}`}
                </p>
              </div>
              <span className="shrink-0 text-muted-foreground">
                {formatSgtDate(card.updated_at)}
              </span>
            </ElevatedCard>
          ))}
        </ul>
      )}
    </div>
  );
}
