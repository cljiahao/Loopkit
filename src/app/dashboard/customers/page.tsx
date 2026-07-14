import { redirect } from "next/navigation";
import { requireVendor } from "@/lib/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { getProgress } from "@/lib/engine";
import { listCards } from "@/lib/cards";
import { listVendorCustomers, type VendorCustomerRow } from "@/lib/customers";
import { formatSgtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type CustomersPageProps = {
  searchParams: Promise<{ q?: string; p?: string }>;
};

// Extracted so it's testable with plain props — no Supabase/auth mocking
// needed. Renders the vendor-level (no ?p=) list: every customer across
// every program, merged.
export function VendorCustomerList({
  customers,
}: {
  customers: VendorCustomerRow[];
}) {
  if (customers.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {customers.map((customer) => (
        <li
          key={customer.phone}
          className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm shadow-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{customer.name ?? customer.phone}</p>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatSgtDate(customer.lastSeenAt)}
            </span>
          </div>
          {customer.name && (
            <p className="text-xs text-muted-foreground">{customer.phone}</p>
          )}
          <div className="flex flex-wrap gap-1">
            {customer.programNames.map((name) => (
              <Badge key={name} variant="secondary">
                {name}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {customer.totalStamps} total stamps/visits · {customer.totalRewards}{" "}
            reward{customer.totalRewards === 1 ? "" : "s"}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { q, p } = await searchParams;

  if (!p) {
    const customers = await listVendorCustomers(q);
    return (
      <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who has a card at your shop, across every program.
          </p>
        </div>
        <form className="flex items-center gap-3" action="/dashboard/customers">
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search by phone"
            className="h-11 rounded-xl"
          />
          <Button
            type="submit"
            variant="outline"
            className="h-11 rounded-xl px-6"
          >
            Search
          </Button>
        </form>
        <VendorCustomerList customers={customers} />
      </main>
    );
  }

  const program = currentProgram(programs, p);
  if (!program) redirect("/setup");

  const cards = await listCards(program.id, q);
  const now = new Date();

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-5 py-10">
      <div>
        {programs.length > 1 ? (
          <form
            action="/dashboard/customers"
            method="get"
            className="mb-4 flex items-center gap-2"
          >
            <input type="hidden" name="q" value={q ?? ""} />
            <select
              name="p"
              defaultValue={program.id}
              aria-label="Switch program"
              className="h-9 flex-1 rounded-lg border bg-card px-3 text-sm"
            >
              {programs.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 rounded-lg border px-4 text-sm font-medium hover:bg-muted/50"
            >
              Switch
            </button>
          </form>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has a {program.name} card.
        </p>
      </div>

      <form className="flex items-center gap-3" action="/dashboard/customers">
        <input type="hidden" name="p" value={program.id} />
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by phone"
          className="h-11 rounded-xl"
        />
        <Button
          type="submit"
          variant="outline"
          className="h-11 rounded-xl px-6"
        >
          Search
        </Button>
      </form>

      {cards.length === 0 ? (
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">No customers yet.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <li
              key={card.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm shadow-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{card.phone}</p>
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
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
