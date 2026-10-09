import { beforeEach, describe, expect, it, vi } from "vitest";
const { client, programs } = vi.hoisted(() => ({
  client: vi.fn(),
  programs: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: client }));
vi.mock("@/lib/program", () => ({ listPrograms: programs }));
import { listActivity } from "./activity";
function query(result: { data: unknown; error: { message: string } | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(async (start: number, end: number) => ({
      ...result,
      data: Array.isArray(result.data)
        ? result.data.slice(start, end + 1)
        : result.data,
    })),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
}
const options = { programIds: ["p1"], limit: 1, offset: 2 };
beforeEach(() => {
  vi.clearAllMocks();
  programs.mockResolvedValue([{ id: "p1", name: "Coffee" }]);
});
describe("activity database pagination", () => {
  it("applies filters before pagination and uses the extra row only for hasMore", async () => {
    const cards = query({
      data: [{ id: "c1", phone: "+6591234567", program_id: "p1" }],
      error: null,
    });
    const events = query({
      data: [
        {
          id: "e0",
          card_id: "c1",
          kind: "redeem",
          created_at: "2026-01-03T12:00:00Z",
        },
        {
          id: "e00",
          card_id: "c1",
          kind: "redeem",
          created_at: "2026-01-03T11:00:00Z",
        },
        { id: "e1", card_id: "c1", kind: "redeem", created_at: "2026-01-02" },
        { id: "e2", card_id: "c1", kind: "redeem", created_at: "2026-01-01" },
      ],
      error: null,
    });
    client.mockResolvedValue({
      from: (table: string) => (table === "cards" ? cards : events),
    });
    const result = await listActivity({
      ...options,
      type: "rewards",
      phone: "+6591234567",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-03",
    });
    expect(cards.eq).toHaveBeenCalledWith("phone", "+6591234567");
    expect(events.or).toHaveBeenCalledWith(
      "kind.eq.redeem,and(kind.eq.visit,payload->>won.eq.true)",
    );
    expect(events.gte).toHaveBeenCalledWith(
      "created_at",
      "2026-01-01T00:00:00+08:00",
    );
    expect(events.lt).toHaveBeenCalledWith(
      "created_at",
      "2026-01-04T00:00:00+08:00",
    );
    expect(events.range).toHaveBeenCalledWith(0, 3);
    expect(result.hasMore).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      id: "e1",
      programName: "Coffee",
      isReward: true,
    });
  });
  it("returns empty without loading events when no matching cards exist", async () => {
    const from = vi.fn().mockReturnValue(query({ data: null, error: null }));
    client.mockResolvedValue({ from });
    expect(await listActivity(options)).toEqual({ rows: [], hasMore: false });
    expect(from).toHaveBeenCalledTimes(1);
  });
  it("rejects failed reads rather than reporting an empty activity history", async () => {
    client.mockResolvedValue({
      from: () => query({ data: null, error: { message: "offline" } }),
    });
    await expect(listActivity(options)).rejects.toThrow(
      "listActivity: offline",
    );
  });
  it("supports stamps filter and propagates event query failure", async () => {
    const cards = query({
      data: [{ id: "c1", phone: "+6591234567", program_id: "p1" }],
      error: null,
    });
    const events = query({
      data: null,
      error: { message: "event read failed" },
    });
    client.mockResolvedValue({
      from: (table: string) => (table === "cards" ? cards : events),
    });
    await expect(listActivity({ ...options, type: "stamps" })).rejects.toThrow(
      "event read failed",
    );
    expect(events.or).toHaveBeenCalledWith(
      "kind.eq.stamp,and(kind.eq.visit,payload->>won.eq.false)",
    );
  });
  it("does not connect when no programs are selected", async () => {
    expect(await listActivity({ ...options, programIds: [] })).toEqual({
      rows: [],
      hasMore: false,
    });
    expect(client).not.toHaveBeenCalled();
  });
});
