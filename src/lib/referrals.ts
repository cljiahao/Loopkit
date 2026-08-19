import { createServerClient } from "@/lib/supabase/server";

export type ReferralHost = {
  id: string;
  programId: string;
  hostPhone: string;
  label: string | null;
  referralCode: string;
  guestCount: number;
  createdAt: string;
};

// Pure: the shareable /c link a guest taps to join through a given host.
export function referralLink(
  origin: string,
  vendorId: string,
  referralCode: string,
): string {
  return `${origin}/c?v=${vendorId}&ref=${referralCode}`;
}

// Every referral host the signed-in vendor has created, most recent first.
// RLS (referral_hosts_own) scopes this to auth.uid(), so no vendor_id filter
// is needed here.
export async function listReferralHosts(): Promise<ReferralHost[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("referral_hosts")
    .select(
      "id,program_id,host_phone,label,referral_code,guest_count,created_at",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listReferralHosts: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    programId: row.program_id,
    hostPhone: row.host_phone,
    label: row.label,
    referralCode: row.referral_code,
    guestCount: row.guest_count,
    createdAt: row.created_at,
  }));
}
