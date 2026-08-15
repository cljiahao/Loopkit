import { redirect } from "next/navigation";
import { requireVendor } from "@/features/auth";
import { listPrograms, currentProgram } from "@/lib/program";
import { listActivity } from "@/lib/activity";
import { ActivityTable } from "@/app/dashboard/activity/activity-table";
import { ActivityFilters } from "@/app/dashboard/activity/activity-filters";

const PAGE_SIZE = 25;

type ActivityPageProps = {
  searchParams: Promise<{
    p?: string;
    type?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

function onlyProgramRedirectHref(
  basePath: string,
  raw: {
    type?: string;
    from?: string;
    to?: string;
    page?: string;
  },
  programId: string,
): string {
  const params = new URLSearchParams();
  if (raw.type) params.set("type", raw.type);
  if (raw.from) params.set("from", raw.from);
  if (raw.to) params.set("to", raw.to);
  if (raw.page) params.set("page", raw.page);
  params.set("p", programId);
  return `${basePath}?${params.toString()}`;
}

function paginationHref(
  basePath: string,
  current: Record<string, string | undefined>,
  page: number,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  return `${basePath}?${params.toString()}`;
}

function PaginationNav({
  basePath,
  params,
  page,
  hasMore,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  hasMore: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      {page > 1 ? (
        <a
          href={paginationHref(basePath, params, page - 1)}
          className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          ← Previous
        </a>
      ) : (
        <span />
      )}
      {hasMore && (
        <a
          href={paginationHref(basePath, params, page + 1)}
          className="text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Next →
        </a>
      )}
    </div>
  );
}

export default async function ActivityPage({
  searchParams,
}: ActivityPageProps) {
  await requireVendor();

  const programs = await listPrograms();
  const { p, type: rawType, from, to, page: rawPage } = await searchParams;
  const type =
    rawType === "stamps" || rawType === "rewards" ? rawType : undefined;
  const page = Math.max(1, Number(rawPage) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const basePath = "/dashboard/activity";

  if (!p && programs.length === 1) {
    redirect(
      onlyProgramRedirectHref(
        basePath,
        { type: rawType, from, to, page: rawPage },
        programs[0].id,
      ),
    );
  }

  const program = p ? currentProgram(programs, p) : null;
  if (p && !program) redirect("/setup");

  const programIds = program ? [program.id] : programs.map((prog) => prog.id);
  const { rows, hasMore } = await listActivity({
    programIds,
    type,
    dateFrom: from,
    dateTo: to,
    limit: PAGE_SIZE,
    offset,
  });

  const description = program
    ? `Recent stamps, plays, and redemptions for ${program.name}.`
    : "Recent stamps, plays, and redemptions across every program.";
  const paginationParams = program
    ? { p: program.id, type, from, to }
    : { type, from, to };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <ActivityFilters
        basePath={basePath}
        programs={programs}
        currentId={program?.id ?? ""}
        currentP={program?.id}
        type={type}
        from={from}
        to={to}
      />
      <ActivityTable activity={rows} showProgram={!program} />
      <PaginationNav
        basePath={basePath}
        params={paginationParams}
        page={page}
        hasMore={hasMore}
      />
    </div>
  );
}
