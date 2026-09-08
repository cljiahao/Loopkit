import type { VendorCustomerRow } from "@/lib/customers";

export type CustomerSegment = "all" | "ready" | "new" | "lapsed";
export type CustomerSort = "recent" | "away" | "progress";

export const CUSTOMER_SEGMENTS: CustomerSegment[] = [
  "all",
  "ready",
  "new",
  "lapsed",
];
export const CUSTOMER_SORTS: CustomerSort[] = ["recent", "away", "progress"];

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const LAPSED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Which segments a row belongs to. Always includes "all". Segments are
// independent views, not a partition: a row can be new and reward-ready.
export function customerSegments(
  row: VendorCustomerRow,
  nowMs: number,
): CustomerSegment[] {
  const segments: CustomerSegment[] = ["all"];
  if (row.rewardReady) segments.push("ready");

  const firstSeen = Date.parse(row.firstSeenAt);
  if (!Number.isNaN(firstSeen) && firstSeen >= nowMs - NEW_WINDOW_MS) {
    segments.push("new");
  }

  const lastSeen = Date.parse(row.lastSeenAt);
  if (!Number.isNaN(lastSeen) && lastSeen < nowMs - LAPSED_WINDOW_MS) {
    segments.push("lapsed");
  }

  return segments;
}

export function filterBySegment(
  rows: VendorCustomerRow[],
  seg: CustomerSegment,
  nowMs: number,
): VendorCustomerRow[] {
  if (seg === "all") return rows;
  return rows.filter((row) => customerSegments(row, nowMs).includes(seg));
}

export function sortCustomers(
  rows: VendorCustomerRow[],
  sort: CustomerSort,
): VendorCustomerRow[] {
  const byRecentDesc = (a: VendorCustomerRow, b: VendorCustomerRow) => {
    if (a.lastSeenAt < b.lastSeenAt) return 1;
    if (a.lastSeenAt > b.lastSeenAt) return -1;
    return 0;
  };

  if (sort === "recent") return [...rows].sort(byRecentDesc);
  if (sort === "away") return [...rows].sort((a, b) => -byRecentDesc(a, b));

  return [...rows].sort((a, b) => {
    if (a.bestGap === null && b.bestGap === null) return byRecentDesc(a, b);
    if (a.bestGap === null) return 1;
    if (b.bestGap === null) return -1;
    if (a.bestGap !== b.bestGap) return a.bestGap - b.bestGap;
    return byRecentDesc(a, b);
  });
}

export function segmentCounts(
  rows: VendorCustomerRow[],
  nowMs: number,
): Record<CustomerSegment, number> {
  const counts: Record<CustomerSegment, number> = {
    all: 0,
    ready: 0,
    new: 0,
    lapsed: 0,
  };
  for (const row of rows) {
    for (const seg of customerSegments(row, nowMs)) counts[seg] += 1;
  }
  return counts;
}

// Parse an untrusted query value, defaulting when unknown.
export function parseSegment(v: string | undefined): CustomerSegment {
  return CUSTOMER_SEGMENTS.includes(v as CustomerSegment)
    ? (v as CustomerSegment)
    : "all";
}

export function parseSort(v: string | undefined): CustomerSort {
  return CUSTOMER_SORTS.includes(v as CustomerSort)
    ? (v as CustomerSort)
    : "recent";
}
