// Pure composition helpers for dashboard/page.tsx. Extracted so the
// zero-active-programs branching (which decides whether the shop QR block
// renders) has fast, unmocked test coverage without needing to render the
// whole async server component (Supabase/auth/qr dependencies).

// The shop QR block invites customers to scan and join "your programs" — it
// must never render when there are no active programs to join, or it
// contradicts the empty-state message telling the vendor none are active.
export function shouldShowQr(activeProgramCount: number): boolean {
  return activeProgramCount > 0;
}

// SGT (UTC+8, no DST). Pure: the caller passes nowMs, never the wall clock.
export function buildGreeting(nowMs: number): string {
  const sgtHour = new Date(nowMs + 8 * 60 * 60 * 1000).getUTCHours();
  if (sgtHour < 12) return "Good morning";
  if (sgtHour < 18) return "Good afternoon";
  return "Good evening";
}

const dayWord = (n: number) => (n === 1 ? "day" : "days");

// The "N days sooner/later than last month" clause, or "" when there is no
// prior cadence to compare against.
function cadenceShiftClause(
  avgDaysNow: number,
  avgDaysPrevPeriod: number | null,
): string {
  if (avgDaysPrevPeriod === null) return "";
  const diff = Math.round(avgDaysPrevPeriod) - avgDaysNow;
  if (diff > 0) return `. ${diff} ${dayWord(diff)} sooner than last month`;
  if (diff < 0) return `. ${-diff} ${dayWord(-diff)} later than last month`;
  return "";
}

// The Overview lead sentence. Vendor-framed: their loyal base and how fast it
// turns over, not a customer celebration.
export function buildBriefing(
  regularsCount: number,
  avgDaysBetweenVisits: number | null,
  avgDaysPrevPeriod: number | null,
): string {
  if (regularsCount === 0) {
    return "No regulars yet this month. A regular is someone who has come back at least once.";
  }
  const noun = regularsCount === 1 ? "regular" : "regulars";
  let s = `${regularsCount} ${noun} kept coming back this month`;
  if (avgDaysBetweenVisits !== null) {
    const d = Math.round(avgDaysBetweenVisits);
    s += `, on average every ${d} ${dayWord(d)}`;
    s += cadenceShiftClause(d, avgDaysPrevPeriod);
  }
  return s + ".";
}
