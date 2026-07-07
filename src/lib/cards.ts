import { createServerClient } from "@/lib/supabase/server";

export type CardRow = {
  id: string;
  phone: string;
  stamp_count: number;
  reward_count: number;
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
    .select("id,phone,stamp_count,reward_count,updated_at")
    .eq("program_id", programId);

  const term = q?.trim();
  if (term) query = query.ilike("phone", `%${term}%`);

  const { data, error } = await query.order("updated_at", {
    ascending: false,
  });
  if (error) throw new Error(`listCards: ${error.message}`);
  return data ?? [];
}
