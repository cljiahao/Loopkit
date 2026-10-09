import { createServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

const CARD_PAGE_SIZE = 1000;
const PROGRAM_BATCH_SIZE = 100;

export type CardRow = {
  id: string;
  phone: string;
  stamp_count: number;
  reward_count: number;
  state: Json;
  updated_at: string;
};

// The signed-in vendor's cards for their program, most-recently-updated
// first. RLS (cards_own) already scopes reads to programs the vendor owns —
// the program_id filter here just narrows to the one program being viewed.
export async function listCards(
  programId: string,
  q?: string,
): Promise<CardRow[]> {
  const supabase = await createServerClient();
  const cards: CardRow[] = [];
  const term = q?.trim();
  let cursor: Pick<CardRow, "updated_at" | "id"> | undefined;
  for (;;) {
    let query = supabase
      .from("cards")
      .select("id,phone,stamp_count,reward_count,state,updated_at")
      .eq("program_id", programId)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(CARD_PAGE_SIZE);
    if (term) query = query.ilike("phone", `%${term}%`);
    if (cursor) {
      query = query.or(
        `updated_at.lt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},id.lt.${cursor.id})`,
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(`listCards: ${error.message}`);
    const rows = data ?? [];
    const last = rows.at(-1);
    if (!last) return cards;
    cards.push(...rows);
    cursor = { updated_at: last.updated_at, id: last.id };
  }
}

const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Cards touched in the last 30 days, counted per program. Drives the
// Counter's first-visit default (the busiest program). RLS scopes the read.
export async function activeCardCountsByProgram(
  programIds: string[],
): Promise<Record<string, number>> {
  if (programIds.length === 0) return {};
  const supabase = await createServerClient();
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();
  const counts: Record<string, number> = {};
  const uniqueIds = [...new Set(programIds)];
  for (
    let offset = 0;
    offset < uniqueIds.length;
    offset += PROGRAM_BATCH_SIZE
  ) {
    const batch = uniqueIds.slice(offset, offset + PROGRAM_BATCH_SIZE);
    let cursor: string | undefined;
    for (;;) {
      let query = supabase
        .from("cards")
        .select("id,program_id")
        .in("program_id", batch)
        .gte("updated_at", cutoff)
        .order("id", { ascending: true })
        .limit(CARD_PAGE_SIZE);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error) throw new Error(`activeCardCountsByProgram: ${error.message}`);
      const rows = data ?? [];
      const last = rows.at(-1);
      if (!last) break;
      addCardCounts(rows, counts);
      cursor = last.id;
    }
  }
  return counts;
}

export async function programCardCount(programId: string): Promise<number> {
  const supabase = await createServerClient();
  const { count, error } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("program_id", programId);
  if (error) throw new Error(`programCardCount: ${error.message}`);
  return count ?? 0;
}

function addCardCounts(
  rows: { program_id: string }[],
  counts: Record<string, number>,
) {
  for (const row of rows)
    counts[row.program_id] = (counts[row.program_id] ?? 0) + 1;
}
