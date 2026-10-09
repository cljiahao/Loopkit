import { readAllRows, readRowsForIds } from "@/lib/read-all-rows";
import { createServerClient } from "@/lib/supabase/server";
import { listPrograms } from "@/lib/program";
import { isWonVisit } from "@/lib/metrics";

export type VendorActivityRow = {
  id: string;
  phone: string;
  programId: string;
  programName: string;
  kind: string;
  isReward: boolean;
  isAdjust: boolean;
  label: string;
  reason: string | null;
  createdAt: string;
};

type ActivityEvent = {
  id: string;
  card_id: string;
  kind: string;
  payload?: unknown;
  created_at: string;
};
type ActivityCard = { id: string; phone: string; program_id: string };

// Pure: classify a single event against its card. Returns null when the
// event's card isn't in the caller's lookup — defensive; the impure shell
// only ever passes events whose cards it already fetched, so this should
// never actually happen given correct callers.
export function mapActivityRow(
  event: ActivityEvent,
  card: ActivityCard | undefined,
  programNameById: Record<string, string>,
): VendorActivityRow | null {
  if (!card) return null;
  const won = isWonVisit(event);
  const isReward = event.kind === "redeem" || won;
  const isAdjust = event.kind === "adjust";
  const payload =
    isAdjust && event.payload && typeof event.payload === "object"
      ? (event.payload as { delta?: number; reason?: string })
      : null;
  const visitLabel = event.kind === "visit" ? "Visit" : event.kind;
  let label = visitLabel;
  if (won) {
    label = "Won";
  } else if (isAdjust && typeof payload?.delta === "number") {
    label = `Adjusted ${payload.delta > 0 ? "+" : ""}${payload.delta}`;
  }
  return {
    id: event.id,
    phone: card.phone,
    programId: card.program_id,
    programName: programNameById[card.program_id] ?? "—",
    kind: event.kind,
    isReward,
    isAdjust,
    label,
    reason: payload?.reason ?? null,
    createdAt: event.created_at,
  };
}

export type ActivityTypeFilter = "stamps" | "rewards";

export type ListActivityOptions = {
  programIds: string[];
  type?: ActivityTypeFilter;
  dateFrom?: string;
  dateTo?: string;
  phone?: string;
  limit: number;
  offset: number;
};

export type ListActivityResult = {
  rows: VendorActivityRow[];
  hasMore: boolean;
};

// Impure shell: every activity event across the given programs, newest
// first, filtered by type/date and paginated at the database level (not
// filtered against an already-fetched batch — a date range or type filter
// must reach full history, not just whatever a fixed row cap happened to
// load). Requests `limit + 1` rows (via .range's inclusive bounds) to
// detect whether a next page exists without a separate COUNT query.
export async function listActivity(
  options: ListActivityOptions,
): Promise<ListActivityResult> {
  const { programIds, dateFrom, dateTo, phone, limit, offset } = options;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 250000
  )
    throw new Error("Invalid activity page");
  for (const date of [dateFrom, dateTo]) {
    if (
      date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date + "T00:00:00Z")) ||
        new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)
    )
      throw new Error("Invalid activity date");
  }
  if (programIds.length === 0) return { rows: [], hasMore: false };

  const supabase = await createServerClient();
  const programs = await listPrograms();
  const programNameById = Object.fromEntries(
    programs.map((p) => [p.id, p.name]),
  );

  const { data: cardsData, error: cardsError } = await readRowsForIds(
    programIds,
    (batch, start, end) => {
      let query = supabase
        .from("cards")
        .select("id,phone,program_id")
        .in("program_id", batch);
      if (phone) query = query.eq("phone", phone);
      return query.order("id", { ascending: true }).range(start, end);
    },
  );
  if (cardsError) throw new Error(`listActivity: ${cardsError.message}`);

  const cards = cardsData ?? [];
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const cardIds = cards.map((c) => c.id);
  if (cardIds.length === 0) return { rows: [], hasMore: false };

  const take = offset + limit + 1;
  const events: ActivityEvent[] = [];
  for (let i = 0; i < cardIds.length; i += 100) {
    const batch = cardIds.slice(i, i + 100);
    const result = await readActivityBatch(supabase, batch, options, take);
    if (result.error) throw new Error(`listActivity: ${result.error.message}`);
    events.push(...(result.data ?? []));
  }
  events.sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
  const page = events.slice(offset, offset + limit + 1);
  const hasMore = page.length > limit;
  const pageEvents = page.slice(0, limit);

  const rows = pageEvents
    .map((event) =>
      mapActivityRow(event, cardsById.get(event.card_id), programNameById),
    )
    .filter((row): row is VendorActivityRow => row !== null);

  return { rows, hasMore };
}

async function readActivityBatch(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  batch: string[],
  options: ListActivityOptions,
  take: number,
) {
  const { type, dateFrom, dateTo } = options;
  return readAllRows((start, end) => {
    if (start >= take) return Promise.resolve({ data: [], error: null });
    let query = supabase
      .from("stamp_events")
      .select("id,card_id,kind,payload,created_at")
      .in("card_id", batch);
    if (type === "stamps")
      query = query.or(
        "kind.eq.stamp,and(kind.eq.visit,payload->>won.eq.false)",
      );
    else if (type === "rewards")
      query = query.or(
        "kind.eq.redeem,and(kind.eq.visit,payload->>won.eq.true)",
      );
    if (dateFrom) query = query.gte("created_at", dateFrom + "T00:00:00+08:00");
    if (dateTo) {
      const next = new Date(dateTo + "T00:00:00Z");
      next.setUTCDate(next.getUTCDate() + 1);
      query = query.lt(
        "created_at",
        next.toISOString().slice(0, 10) + "T00:00:00+08:00",
      );
    }
    return query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, Math.min(end, take - 1));
  });
}
