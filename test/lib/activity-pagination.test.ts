import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), programs: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ from: mocks.from }),
}));
vi.mock("@/lib/program", () => ({ listPrograms: mocks.programs }));
import { listActivity } from "@/lib/activity";
type Row = Record<string, string>;
const rows: Record<string, Row[]> = {};
const bounds: unknown[][] = [];
const batches: string[][] = [];
function query(table: string) {
  let subset = rows[table] ?? [];
  const builder = {
    select: () => builder,
    order: () => builder,
    in: (column: string, ids: string[]) => {
      if (table === "stamp_events") {
        batches.push(ids);
      }
      subset = subset.filter((row) => ids.includes(row[column]));
      return builder;
    },
    eq: (column: string, value: string) => {
      subset = subset.filter((row) => row[column] === value);
      return builder;
    },
    or: () => builder,
    gte: (column: string, value: string) => {
      bounds.push(["gte", value]);
      subset = subset.filter(
        (row) => Date.parse(row[column]) >= Date.parse(value),
      );
      return builder;
    },
    lt: (column: string, value: string) => {
      bounds.push(["lt", value]);
      subset = subset.filter(
        (row) => Date.parse(row[column]) < Date.parse(value),
      );
      return builder;
    },
    range: async (start: number, end: number) => ({
      data: subset.slice(start, Math.min(end + 1, start + 1)),
      error: null,
    }),
  };
  return builder;
}
beforeEach(() => {
  vi.resetAllMocks();
  bounds.length = 0;
  batches.length = 0;
  rows.cards = [];
  rows.stamp_events = [];
  mocks.from.mockImplementation(query);
  mocks.programs.mockResolvedValue([{ id: "p", name: "Coffee" }]);
});
it("reads every card batch and merges the global page under a one-row server cap", async () => {
  rows.cards = Array.from({ length: 205 }, (_, i) => ({
    id: "c" + i,
    phone: "91234567",
    program_id: "p",
  }));
  rows.stamp_events = [
    {
      id: "old",
      card_id: "c0",
      kind: "stamp",
      created_at: "2026-10-01T00:00:00Z",
    },
    {
      id: "new",
      card_id: "c204",
      kind: "stamp",
      created_at: "2026-10-08T00:00:00Z",
    },
  ];
  const first = await listActivity({ programIds: ["p"], limit: 1, offset: 0 });
  expect(first.rows.map((row) => row.id)).toEqual(["new"]);
  expect(first.hasMore).toBe(true);
  expect(batches.some((batch) => batch.includes("c204"))).toBe(true);
  expect(batches.every((batch) => batch.length <= 100)).toBe(true);
  const second = await listActivity({ programIds: ["p"], limit: 1, offset: 1 });
  expect(second.rows.map((row) => row.id)).toEqual(["old"]);
  expect(second.hasMore).toBe(false);
});
it("uses Singapore midnight bounds including fractional final seconds", async () => {
  rows.cards = [{ id: "c", phone: "91234567", program_id: "p" }];
  rows.stamp_events = [
    {
      id: "in",
      card_id: "c",
      kind: "stamp",
      created_at: "2026-10-08T15:59:59.999Z",
    },
    {
      id: "out",
      card_id: "c",
      kind: "stamp",
      created_at: "2026-10-08T16:00:00Z",
    },
  ];
  const result = await listActivity({
    programIds: ["p"],
    limit: 10,
    offset: 0,
    dateFrom: "2026-10-08",
    dateTo: "2026-10-08",
  });
  expect(result.rows.map((row) => row.id)).toEqual(["in"]);
  expect(bounds).toContainEqual(["gte", "2026-10-08T00:00:00+08:00"]);
  expect(bounds).toContainEqual(["lt", "2026-10-09T00:00:00+08:00"]);
});
it.each([Infinity, 0.5, -1])(
  "rejects invalid offset %s before queries",
  async (offset) => {
    await expect(
      listActivity({ programIds: ["p"], limit: 10, offset }),
    ).rejects.toThrow("Invalid activity page");
    expect(mocks.from).not.toHaveBeenCalled();
  },
);

it("rejects normalized impossible calendar dates before queries", async () => {
  await expect(
    listActivity({
      programIds: ["p"],
      limit: 10,
      offset: 0,
      dateTo: "2026-02-30",
    }),
  ).rejects.toThrow("Invalid activity date");
  expect(mocks.from).not.toHaveBeenCalled();
});
