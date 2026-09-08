// Pure view-model helpers for dashboard/page.tsx. Extracted so the page's
// composition logic has fast, unmocked test coverage without rendering the
// whole async server component (Supabase/auth dependencies).

import type { ProgramStats } from "@/lib/stats";
import type { VendorActivityRow } from "@/lib/activity";

// The shop QR block invites customers to scan and join "your programs", so it
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

export type TrendBar = { date: string; count: number };

export type TrendView = {
  bars7: TrendBar[];
  bars14: TrendBar[];
  deltaVsLastWeek: number;
};

// Slice the 30-day visit buckets into the two windows the trend chart shows.
// bars7 = last 7 days, bars14 = last 14. deltaVsLastWeek = sum(last 7) minus
// sum(the 7 before that), and 0 when there is no full prior week to compare.
export function splitTrend(visitsByDay: TrendBar[]): TrendView {
  const sum = (a: TrendBar[]) => a.reduce((n, d) => n + d.count, 0);
  const prior = visitsByDay.slice(-14, -7);
  return {
    bars7: visitsByDay.slice(-7),
    bars14: visitsByDay.slice(-14),
    deltaVsLastWeek:
      prior.length < 7 ? 0 : sum(visitsByDay.slice(-7)) - sum(prior),
  };
}

export type BaseStat = {
  key: "regulars" | "new" | "lapsed" | "net";
  label: string;
  // already sign-formatted, e.g. "+9", "-4", "38"
  display: string;
  tone: "plain" | "pos" | "soft";
  title: string;
  body: string;
  hint: string;
};

// The 4 self-explaining base stats. Copy is verbatim from the approved
// mockup's data-title / data-body / data-hint attributes.
export function buildBaseStats(input: {
  active: number;
  newThisMonth: number;
  lapsed: number;
}): BaseStat[] {
  const { active, newThisMonth, lapsed } = input;
  const net = newThisMonth - lapsed;
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  return [
    {
      key: "regulars",
      label: "active regulars",
      display: String(active),
      tone: "plain",
      title: "Active regulars",
      body: "Visited 2 or more times, and back within the last 30 days.",
      hint: "Your loyal base right now.",
    },
    {
      key: "new",
      label: "new this month",
      display: signed(newThisMonth),
      tone: newThisMonth > 0 ? "pos" : "plain",
      title: "New this month",
      body: "First-time cards created since the 1st.",
      hint: "People just trying the program.",
    },
    {
      key: "lapsed",
      label: "lapsed",
      display: lapsed === 0 ? "0" : `-${lapsed}`,
      tone: "soft",
      title: "Lapsed",
      body: "Regulars not seen in 30 or more days.",
      hint: "They were coming. Now quiet.",
    },
    {
      key: "net",
      label: "net",
      display: signed(net),
      tone: "plain",
      title: "Net change",
      body: "New cards minus lapsed regulars.",
      hint: "Whether your base grew or shrank this month.",
    },
  ];
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

export type OverviewProgram = {
  id: string;
  name: string;
  type: string;
  // returnRate90d for this program, 0..1, null when not enough data
  returnRate: number | null;
  rewardText: string;
  rewardCostCents: number | null;
  // reward events for this program since the 1st of the month
  rewardsThisMonth: number;
};

export type WorthALookItem =
  | { kind: "gone-quiet"; count: number }
  | { kind: "one-away"; count: number }
  | { kind: "two-away"; count: number };

export type CostView = {
  rewardsThisMonth: number;
  knownCostCents: number;
  programsMissingCost: number;
  expiredUnclaimed: number;
  pendingReturnSoon: number;
  perProgram: {
    name: string;
    rewardText: string;
    unitCents: number | null;
    redeemed: number;
    lineCents: number | null;
  }[];
};

export type OverviewModel = {
  greeting: string;
  briefing: string;
  baseStats: BaseStat[];
  redemptionRatePct: number;
  returnRatePct: number | null;
  trend: TrendView;
  worthALook: WorthALookItem[];
  cost: CostView;
  programs: OverviewProgram[];
  serveDefaultProgramId: string;
};

export type BuildOverviewInput = {
  nowMs: number;
  vendorName: string;
  stats: ProgramStats;
  vendorReturnRate: number | null;
  regularsCount: number;
  newThisMonth: number;
  goneQuiet: number;
  near: { oneAway: number; twoAway: number };
  expiredUnclaimed: number;
  recentActivity: VendorActivityRow[];
  programs: OverviewProgram[];
  serveDefaultProgramId: string;
};

// The vendor P&L view: rewards redeemed this month and what they cost, plus
// breakage (expired unclaimed) and the near-certain visits still pending.
export function buildCostView(
  programs: OverviewProgram[],
  expiredUnclaimed: number,
  near: { oneAway: number; twoAway: number },
): CostView {
  let rewardsThisMonth = 0;
  let knownCostCents = 0;
  let programsMissingCost = 0;
  const perProgram = programs.map((p) => {
    rewardsThisMonth += p.rewardsThisMonth;
    const lineCents =
      p.rewardCostCents === null
        ? null
        : p.rewardCostCents * p.rewardsThisMonth;
    if (lineCents !== null) knownCostCents += lineCents;
    if (p.rewardCostCents === null && p.rewardsThisMonth > 0) {
      programsMissingCost += 1;
    }
    return {
      name: p.name,
      rewardText: p.rewardText,
      unitCents: p.rewardCostCents,
      redeemed: p.rewardsThisMonth,
      lineCents,
    };
  });
  return {
    rewardsThisMonth,
    knownCostCents,
    programsMissingCost,
    expiredUnclaimed,
    pendingReturnSoon: near.oneAway + near.twoAway,
    perProgram,
  };
}

// The "Worth a look" action rows: gone-quiet regulars first, then one-away,
// then two-away. Any count of 0 is dropped.
function buildWorthALook(
  goneQuiet: number,
  near: { oneAway: number; twoAway: number },
): WorthALookItem[] {
  const items: WorthALookItem[] = [
    { kind: "gone-quiet", count: goneQuiet },
    { kind: "one-away", count: near.oneAway },
    { kind: "two-away", count: near.twoAway },
  ];
  return items.filter((i) => i.count > 0);
}

// Wires Tasks 1 to 4 together into the single object dashboard/page.tsx renders.
export function buildOverviewModel(input: BuildOverviewInput): OverviewModel {
  return {
    greeting: buildGreeting(input.nowMs),
    briefing: buildBriefing(
      input.regularsCount,
      input.stats.avgDaysBetweenVisits,
      null,
    ),
    baseStats: buildBaseStats({
      active: input.regularsCount,
      newThisMonth: input.newThisMonth,
      lapsed: input.stats.lapsed,
    }),
    redemptionRatePct: Math.round(input.stats.redemptionRate * 100),
    returnRatePct:
      input.vendorReturnRate === null
        ? null
        : Math.round(input.vendorReturnRate * 100),
    trend: splitTrend(input.stats.visitsByDay),
    worthALook: buildWorthALook(input.goneQuiet, input.near),
    cost: buildCostView(input.programs, input.expiredUnclaimed, input.near),
    programs: input.programs,
    serveDefaultProgramId: input.serveDefaultProgramId,
  };
}
