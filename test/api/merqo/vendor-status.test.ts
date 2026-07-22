import { describe, it, expect, beforeEach, vi } from "vitest";

const { listUsersMock, fromMock } = vi.hoisted(() => ({
  listUsersMock: vi.fn(),
  fromMock: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(async () => ({
    auth: { admin: { listUsers: listUsersMock } },
    from: fromMock,
  })),
}));

import { GET } from "@/app/api/merqo/vendor-status/route";

function selectResult(rows: { vendor_id: string }[]) {
  return { select: () => Promise.resolve({ data: rows, error: null }) };
}

function user(id: string, email: string) {
  return { id, email };
}

const req = (email: string, auth?: string) =>
  new Request(`http://localhost/api/merqo/vendor-status?email=${email}`, {
    headers: auth ? { Authorization: auth } : {},
  });

describe("GET /api/merqo/vendor-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MERQO_METRICS_SECRET = "test-secret";
    fromMock.mockReturnValue(selectResult([]));
  });

  it("401 when the bearer is missing", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    const res = await GET(req("v@x.com"));
    expect(res.status).toBe(401);
  });

  it("400 when email is missing", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    const res = await GET(
      new Request("http://localhost/api/merqo/vendor-status", {
        headers: { Authorization: "Bearer test-secret" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("resolves a vendor found on the first page", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [user("v1", "vendor@x.com")] },
      error: null,
    });
    fromMock.mockImplementation((table: string) =>
      selectResult(table === "programs" ? [{ vendor_id: "v1" }] : []),
    );

    const res = await GET(req("vendor@x.com", "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: true, plan: "free" });
    expect(listUsersMock).toHaveBeenCalledTimes(1);
  });

  it("paginates past a full first page to find a vendor on page 2", async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) =>
      user(`u${i}`, `u${i}@x.com`),
    );
    listUsersMock
      .mockResolvedValueOnce({ data: { users: fullPage }, error: null })
      .mockResolvedValueOnce({
        data: { users: [user("v-late", "late@x.com")] },
        error: null,
      });
    fromMock.mockImplementation((table: string) =>
      selectResult(table === "programs" ? [{ vendor_id: "v-late" }] : []),
    );

    const res = await GET(req("late@x.com", "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: true, plan: "free" });
    expect(listUsersMock).toHaveBeenCalledTimes(2);
    expect(listUsersMock).toHaveBeenNthCalledWith(1, {
      page: 1,
      perPage: 1000,
    });
    expect(listUsersMock).toHaveBeenNthCalledWith(2, {
      page: 2,
      perPage: 1000,
    });
  });

  it("stops paginating once a partial page is returned", async () => {
    listUsersMock.mockResolvedValueOnce({
      data: { users: [user("v1", "vendor@x.com")] },
      error: null,
    });
    const res = await GET(req("vendor@x.com", "Bearer test-secret"));
    expect(res.status).toBe(200);
    expect(listUsersMock).toHaveBeenCalledTimes(1);
  });

  it("503 when listUsers errors", async () => {
    listUsersMock.mockResolvedValue({
      data: null,
      error: { message: "boom" },
    });
    const res = await GET(req("vendor@x.com", "Bearer test-secret"));
    expect(res.status).toBe(503);
  });

  it("503 when a table read errors", async () => {
    listUsersMock.mockResolvedValue({
      data: { users: [user("v1", "vendor@x.com")] },
      error: null,
    });
    fromMock.mockReturnValue({
      select: () =>
        Promise.resolve({ data: null, error: { message: "db down" } }),
    });
    const res = await GET(req("vendor@x.com", "Bearer test-secret"));
    expect(res.status).toBe(503);
  });
});
