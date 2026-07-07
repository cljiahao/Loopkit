import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors qkit's sales/summary.test.ts mock style: a chainable, awaitable
// query-builder stub. Every builder method returns the same object; awaiting
// it resolves via `then` — mimicking supabase-js's PostgrestFilterBuilder.
const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}));

import { listCards, type CardRow } from "@/lib/cards";

function makeBuilder(data: unknown, error: unknown = null) {
  const ilike = vi.fn(() => b);
  const b: Record<string, unknown> = {
    select: vi.fn(() => b),
    eq: vi.fn(() => b),
    ilike,
    order: vi.fn(() => b),
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      resolve({ data, error }),
  };
  return { builder: b, ilike };
}

const rows: CardRow[] = [
  {
    id: "c1",
    phone: "+6591234567",
    stamp_count: 3,
    reward_count: 0,
    updated_at: "2026-07-01T00:00:00Z",
  },
];

describe("listCards", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the program's cards", async () => {
    const { builder } = makeBuilder(rows);
    fromMock.mockReturnValue(builder);

    const result = await listCards("p1");

    expect(result).toEqual(rows);
    expect(fromMock).toHaveBeenCalledWith("cards");
  });

  it("filters by phone when q is given", async () => {
    const { builder, ilike } = makeBuilder(rows);
    fromMock.mockReturnValue(builder);

    await listCards("p1", "9123");

    expect(ilike).toHaveBeenCalledWith("phone", "%9123%");
  });

  it("skips the phone filter when q is empty or whitespace", async () => {
    const { builder, ilike } = makeBuilder(rows);
    fromMock.mockReturnValue(builder);

    await listCards("p1", "   ");

    expect(ilike).not.toHaveBeenCalled();
  });

  it("throws when the query errors", async () => {
    const { builder } = makeBuilder(null, { message: "boom" });
    fromMock.mockReturnValue(builder);

    await expect(listCards("p1")).rejects.toThrow();
  });
});
