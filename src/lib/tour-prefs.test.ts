import { beforeEach, describe, expect, it, vi } from "vitest";

import { stampTourSeen } from "./tour-prefs";

const { upsertMock, fromMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  fromMock: vi.fn(),
}));

beforeEach(() => {
  upsertMock.mockReset().mockResolvedValue({ error: null });
  fromMock.mockReset().mockReturnValue({ upsert: upsertMock });
});

function fakeSupabase() {
  return { from: fromMock } as unknown as Parameters<typeof stampTourSeen>[0];
}

describe("stampTourSeen", () => {
  it("upserts tour_seen_at on the vendor's own row", async () => {
    await stampTourSeen(fakeSupabase(), "v1");

    expect(fromMock).toHaveBeenCalledWith("vendors");
    expect(upsertMock).toHaveBeenCalledWith({
      vendor_id: "v1",
      tour_seen_at: expect.any(String),
    });
  });

  it("logs but does not throw when the upsert fails", async () => {
    upsertMock.mockResolvedValue({ error: { message: "RLS denied" } });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(stampTourSeen(fakeSupabase(), "v1")).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "markTourSeen failed",
      "RLS denied",
    );
    consoleError.mockRestore();
  });
});
