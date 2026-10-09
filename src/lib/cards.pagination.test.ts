import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Response = {
  data: unknown[] | null;
  error: { message: string } | null;
  count?: number | null;
};
type Call = [string, unknown[]];
const m = vi.hoisted(() => ({
  create: vi.fn(),
  queries: [] as Call[][],
  responses: [] as Response[],
}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: m.create }));
import {
  activeCardCountsByProgram,
  listCards,
  programCardCount,
} from "./cards";

function response(data: unknown[] | null): Response {
  return { data, error: null };
}
function card(id: string, updated_at = "2026-10-08T00:00:00.000Z") {
  return {
    id,
    updated_at,
    phone: "+6590000000",
    stamp_count: 1,
    reward_count: 0,
    state: {},
  };
}
beforeEach(() => {
  m.queries.length = 0;
  m.responses.length = 0;
  m.create.mockReset().mockResolvedValue({
    from: (table: string) => {
      const calls: Call[] = [["from", [table]]];
      m.queries.push(calls);
      const chain = {
        select: (...args: unknown[]) => {
          calls.push(["select", args]);
          return chain;
        },
        eq: (...args: unknown[]) => {
          calls.push(["eq", args]);
          return chain;
        },
        in: (...args: unknown[]) => {
          calls.push(["in", args]);
          return chain;
        },
        ilike: (...args: unknown[]) => {
          calls.push(["ilike", args]);
          return chain;
        },
        gte: (...args: unknown[]) => {
          calls.push(["gte", args]);
          return chain;
        },
        gt: (...args: unknown[]) => {
          calls.push(["gt", args]);
          return chain;
        },
        order: (...args: unknown[]) => {
          calls.push(["order", args]);
          return chain;
        },
        limit: (...args: unknown[]) => {
          calls.push(["limit", args]);
          return chain;
        },
        or: (...args: unknown[]) => {
          calls.push(["or", args]);
          return chain;
        },
        then: (resolveResponse: (value: Response) => unknown) => {
          const next = m.responses.shift();
          if (!next) throw new Error("Unexpected query beyond supplied pages");
          return Promise.resolve(next).then(resolveResponse);
        },
      };
      return chain;
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("listCards pagination", () => {
  it("reads short server-capped pages with tied timestamps and preserves search/scope", async () => {
    const first = card("c3");
    const second = card("c2");
    const third = card("c1", "2026-10-07T00:00:00.000Z");
    m.responses.push(
      response([first]),
      response([second, third]),
      response([]),
    );
    expect(await listCards("program-1", " 9000 ")).toEqual([
      first,
      second,
      third,
    ]);
    expect(m.queries).toHaveLength(3);
    for (const calls of m.queries) {
      expect(calls).toContainEqual(["eq", ["program_id", "program-1"]]);
      expect(calls).toContainEqual(["ilike", ["phone", "%9000%"]]);
      expect(calls).toContainEqual([
        "order",
        ["updated_at", { ascending: false }],
      ]);
      expect(calls).toContainEqual(["order", ["id", { ascending: false }]]);
      expect(calls).toContainEqual(["limit", [1000]]);
    }
    expect(m.queries[1]).toContainEqual([
      "or",
      [
        "updated_at.lt.2026-10-08T00:00:00.000Z,and(updated_at.eq.2026-10-08T00:00:00.000Z,id.lt.c3)",
      ],
    ]);
    expect(m.queries[2]).toContainEqual([
      "or",
      [
        "updated_at.lt.2026-10-07T00:00:00.000Z,and(updated_at.eq.2026-10-07T00:00:00.000Z,id.lt.c1)",
      ],
    ]);
  });
  it.each([undefined, "   "])("omits an empty search (%s)", async (search) => {
    m.responses.push(response(null));
    expect(await listCards("p1", search)).toEqual([]);
    expect(m.queries[0].some(([method]) => method === "ilike")).toBe(false);
  });
  it("rejects a later page failure rather than returning incomplete cards", async () => {
    m.responses.push(response([card("c1")]), {
      data: null,
      error: { message: "offline" },
    });
    await expect(listCards("p1")).rejects.toThrow("listCards: offline");
  });
});

describe("active card count pagination", () => {
  it("does not create a client for no programs", async () => {
    expect(await activeCardCountsByProgram([])).toEqual({});
    expect(m.create).not.toHaveBeenCalled();
  });
  it("counts every page with a single cutoff and stable card cursor", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
    m.responses.push(
      response([{ id: "a", program_id: "p1" }]),
      response([
        { id: "b", program_id: "p2" },
        { id: "c", program_id: "p1" },
      ]),
      response([]),
    );
    expect(await activeCardCountsByProgram(["p1", "p2"])).toEqual({
      p1: 2,
      p2: 1,
    });
    expect(m.queries[1]).toContainEqual(["gt", ["id", "a"]]);
    expect(m.queries[2]).toContainEqual(["gt", ["id", "c"]]);
    for (const calls of m.queries) {
      expect(calls).toContainEqual([
        "gte",
        ["updated_at", "2026-09-08T00:00:00.000Z"],
      ]);
      expect(calls).toContainEqual(["order", ["id", { ascending: true }]]);
    }
  });
  it("deduplicates and bounds program batches, resetting the cursor per batch", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => "p" + i);
    m.responses.push(
      response([{ id: "c1", program_id: "p0" }]),
      response([]),
      response([{ id: "c2", program_id: "p100" }]),
      response([]),
    );
    expect(await activeCardCountsByProgram([...ids, "p0", "p100"])).toEqual({
      p0: 1,
      p100: 1,
    });
    expect(m.queries[0]).toContainEqual([
      "in",
      ["program_id", ids.slice(0, 100)],
    ]);
    expect(m.queries[2]).toContainEqual(["in", ["program_id", ["p100"]]]);
    expect(m.queries[2].some(([method]) => method === "gt")).toBe(false);
    expect(m.queries).toHaveLength(4);
  });
  it("throws when a later count page fails", async () => {
    m.responses.push(response([{ id: "c1", program_id: "p1" }]), {
      data: null,
      error: { message: "offline" },
    });
    await expect(activeCardCountsByProgram(["p1"])).rejects.toThrow(
      "activeCardCountsByProgram: offline",
    );
  });
  it("handles no visible cards under RLS", async () => {
    m.responses.push(response(null));
    expect(await activeCardCountsByProgram(["other-program"])).toEqual({});
  });
});

describe("programCardCount exact query", () => {
  it.each([12, null])("returns the exact count or zero (%s)", async (count) => {
    m.responses.push({ data: null, error: null, count });
    expect(await programCardCount("p1")).toBe(count ?? 0);
    expect(m.queries[0]).toContainEqual([
      "select",
      ["id", { count: "exact", head: true }],
    ]);
    expect(m.queries[0]).toContainEqual(["eq", ["program_id", "p1"]]);
  });
  it("does not turn a count error into zero", async () => {
    m.responses.push({ data: null, error: { message: "offline" } });
    await expect(programCardCount("p1")).rejects.toThrow(
      "programCardCount: offline",
    );
  });
});
