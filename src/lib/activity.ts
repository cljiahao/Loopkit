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

const MAX_ROWS = 15;

// Pure: resolve each event's card/program, classify reward vs. plain
// activity (same "won visit or redeem" rule as src/lib/stats.ts), return
// newest-first, capped at MAX_ROWS. An event whose card isn't in
// cardsById is dropped — defensive; should not happen given the impure
// shell only fetches events for cards it already loaded.
export function aggregateActivity(
  events: ActivityEvent[],
  cardsById: Map<string, ActivityCard>,
  programNameById: Record<string, string>,
): VendorActivityRow[] {
  const rows: VendorActivityRow[] = [];
  for (const event of events) {
    const card = cardsById.get(event.card_id);
    if (!card) continue;
    const won = isWonVisit(event);
    const isReward = event.kind === "redeem" || won;
    const label = won ? "Won" : event.kind === "visit" ? "Visit" : event.kind;
    rows.push({
      id: event.id,
      phone: card.phone,
      programName: programNameById[card.program_id] ?? "—",
      kind: event.kind,
      isReward,
      label,
      createdAt: event.created_at,
    });
  }

  return rows
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, MAX_ROWS);
}

// Impure shell: every activity event across every one of the vendor's
// programs, newest first. Mirrors listVendorCustomers's two-query shape
// (programs -> their cards -> those cards' events); RLS scopes both
// `cards` and `stamp_events` reads to the signed-in vendor already.
export async function listVendorActivity(): Promise<VendorActivityRow[]> {
  const supabase = await createServerClient();
  const programs = await listPrograms();
  const programNameById = Object.fromEntries(
    programs.map((p) => [p.id, p.name]),
  );
  const programIds = programs.map((p) => p.id);
  if (programIds.length === 0) return [];

  const { data: cardsData, error: cardsError } = await supabase
    .from("cards")
    .select("id,phone,program_id")
    .in("program_id", programIds);
  if (cardsError) throw new Error(`listVendorActivity: ${cardsError.message}`);

  const cards = cardsData ?? [];
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const cardIds = cards.map((c) => c.id);
  if (cardIds.length === 0) return [];

  const { data: eventsData, error: eventsError } = await supabase
    .from("stamp_events")
    .select("id,card_id,kind,payload,created_at")
    .in("card_id", cardIds)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);
  if (eventsError)
    throw new Error(`listVendorActivity: ${eventsError.message}`);

  return aggregateActivity(eventsData ?? [], cardsById, programNameById);
}
