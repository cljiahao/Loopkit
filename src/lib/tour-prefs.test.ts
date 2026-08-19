import { beforeEach, describe, expect, it, vi } from "vitest";

import { stampTourSeen } from "./tour-prefs";

const { eqMock, updateMock, fromMock } = vi.hoisted(() => ({
  eqMock: vi.fn(),
  updateMock: vi.fn(),
  fromMock: vi.fn(),
}));

beforeEach(() => {
  eqMock.mockReset().mockResolvedValue({ error: null });
  updateMock.mockReset().mockReturnValue({ eq: eqMock });
  fromMock.mockReset().mockReturnValue({ update: updateMock });
});

function fakeSupabase() {
  return { from: fromMock } as unknown as Parameters<typeof stampTourSeen>[0];
}

describe("stampTourSeen", () => {
  it("stamps tour_seen_at on the vendor's own row", async () => {
    await stampTourSeen(fakeSupabase(), "v1");

    expect(fromMock).toHaveBeenCalledWith("vendors");
    expect(updateMock).toHaveBeenCalledWith({
      tour_seen_at: expect.any(String),
    });
    expect(eqMock).toHaveBeenCalledWith("vendor_id", "v1");
  });

  it("logs but does not throw when the update fails", async () => {
    eqMock.mockResolvedValue({ error: { message: "RLS denied" } });
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
