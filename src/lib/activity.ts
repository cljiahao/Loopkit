import { createServerClient } from "@/lib/supabase/server";
import { listPrograms } from "@/lib/program";
import { isWonVisit } from "@/lib/metrics";

export type VendorActivityRow = {
  id: string;
  phone: string;
  programName: string;
  kind: string;
  isReward: boolean;
  label: string;
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
  const label = won ? "Won" : event.kind === "visit" ? "Visit" : event.kind;
  return {
    id: event.id,
    phone: card.phone,
    programName: programNameById[card.program_id] ?? "—",
    kind: event.kind,
    isReward,
    label,
    createdAt: event.created_at,
  };
}

export type ActivityTypeFilter = "stamps" | "rewards";

export type ListActivityOptions = {
  programIds: string[];
  type?: ActivityTypeFilter;
  dateFrom?: string;
  dateTo?: string;
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
  const { programIds, type, dateFrom, dateTo, limit, offset } = options;
  if (programIds.length === 0) return { rows: [], hasMore: false };

  const supabase = await createServerClient();
  const programs = await listPrograms();
  const programNameById = Object.fromEntries(
    programs.map((p) => [p.id, p.name]),
  );

  const { data: cardsData, error: cardsError } = await supabase
    .from("cards")
    .select("id,phone,program_id")
    .in("program_id", programIds);
  if (cardsError) throw new Error(`listActivity: ${cardsError.message}`);

  const cards = cardsData ?? [];
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const cardIds = cards.map((c) => c.id);
  if (cardIds.length === 0) return { rows: [], hasMore: false };

  let query = supabase
    .from("stamp_events")
    .select("id,card_id,kind,payload,created_at")
    .in("card_id", cardIds);

  // payload.won is always an explicit boolean on every 'visit' row (never
  // null/absent — written by recordVisitAction), so these payload-path
  // equality filters never hit SQL's NULL-comparison trap.
  if (type === "stamps") {
    query = query.or("kind.eq.stamp,and(kind.eq.visit,payload->>won.eq.false)");
  } else if (type === "rewards") {
    query = query.or("kind.eq.redeem,and(kind.eq.visit,payload->>won.eq.true)");
  }
  if (dateFrom) {
    query = query.gte("created_at", `${dateFrom}T00:00:00`);
  }
  if (dateTo) {
    query = query.lte("created_at", `${dateTo}T23:59:59`);
  }

  const { data: eventsData, error: eventsError } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit);
  if (eventsError) throw new Error(`listActivity: ${eventsError.message}`);

  const events = eventsData ?? [];
  const hasMore = events.length > limit;
  const pageEvents = events.slice(0, limit);

  const rows = pageEvents
    .map((event) =>
      mapActivityRow(event, cardsById.get(event.card_id), programNameById),
    )
    .filter((row): row is VendorActivityRow => row !== null);

  return { rows, hasMore };
}
