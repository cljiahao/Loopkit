import { createServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types";

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
  let query = supabase
    .from("cards")
    .select("id,phone,stamp_count,reward_count,state,updated_at")
    .eq("program_id", programId);

  const term = q?.trim();
  if (term) query = query.ilike("phone", `%${term}%`);

  const { data, error } = await query.order("updated_at", {
    ascending: false,
  });
  if (error) throw new Error(`listCards: ${error.message}`);
  return data ?? [];
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
  const { data, error } = await supabase
    .from("cards")
    .select("program_id")
    .in("program_id", programIds)
    .gte("updated_at", cutoff);
  if (error) throw new Error(`activeCardCountsByProgram: ${error.message}`);
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.program_id] = (counts[row.program_id] ?? 0) + 1;
  }
  return counts;
}
