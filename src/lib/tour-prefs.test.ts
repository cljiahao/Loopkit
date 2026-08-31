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

  it("stamps a vendor who has no row yet — an update would silently no-op here", async () => {
    // loopkit.vendors is created lazily (first /profile save); a vendor who
    // lands on the dashboard without ever visiting /profile has no row.
    // upsert must still succeed in that case, matching what the vendors_own
    // RLS policy's WITH CHECK allows on insert (vendor_id = auth.uid()).
    await stampTourSeen(fakeSupabase(), "v-no-row-yet");

    expect(upsertMock).toHaveBeenCalledWith({
      vendor_id: "v-no-row-yet",
      tour_seen_at: expect.any(String),
    });
  });
});
