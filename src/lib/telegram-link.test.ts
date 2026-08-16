import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  maybeSingleMock,
  limitMock,
  orderMock,
  gtMock,
  eqSelectMock,
  selectMock,
  insertMock,
  eqDeleteMock,
  deleteMock,
  fromMock,
  createServiceClientMock,
  generateLinkTokenMock,
} = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  limitMock: vi.fn(),
  orderMock: vi.fn(),
  gtMock: vi.fn(),
  eqSelectMock: vi.fn(),
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  eqDeleteMock: vi.fn(),
  deleteMock: vi.fn(),
  fromMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  generateLinkTokenMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
vi.mock("@/lib/telegram", () => ({
  generateLinkToken: generateLinkTokenMock,
}));

import {
  disconnectTelegram,
  getOrCreateTelegramLinkToken,
} from "./telegram-link";

beforeEach(() => {
  maybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
  limitMock.mockReset().mockReturnValue({ maybeSingle: maybeSingleMock });
  orderMock.mockReset().mockReturnValue({ limit: limitMock });
  gtMock.mockReset().mockReturnValue({ order: orderMock });
  eqSelectMock.mockReset().mockReturnValue({ gt: gtMock });
  selectMock.mockReset().mockReturnValue({ eq: eqSelectMock });
  insertMock.mockReset().mockResolvedValue({ error: null });
  eqDeleteMock.mockReset().mockResolvedValue({ error: null });
  deleteMock.mockReset().mockReturnValue({ eq: eqDeleteMock });
  fromMock.mockReset().mockImplementation((table: string) => {
    if (table === "telegram_link_tokens") {
      return { select: selectMock, insert: insertMock };
    }
    if (table === "vendor_telegram") {
      return { delete: deleteMock };
    }
    throw new Error(`unexpected table ${table}`);
  });
  createServiceClientMock.mockReset().mockResolvedValue({ from: fromMock });
  generateLinkTokenMock.mockReset().mockReturnValue("fresh-token");
});

describe("getOrCreateTelegramLinkToken", () => {
  it("reuses an existing unexpired token instead of minting a new one", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { token: "existing-token" },
      error: null,
    });

    const token = await getOrCreateTelegramLinkToken("vendor-1");

    expect(token).toBe("existing-token");
    expect(eqSelectMock).toHaveBeenCalledWith("vendor_id", "vendor-1");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("mints and inserts a fresh 30-minute-expiry token when none is valid", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const token = await getOrCreateTelegramLinkToken("vendor-1");

    expect(token).toBe("fresh-token");
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: "fresh-token", vendor_id: "vendor-1" }),
    );
    const insertedRow = insertMock.mock.calls[0][0] as { expires_at: string };
    const expiresInMs = new Date(insertedRow.expires_at).getTime() - Date.now();
    expect(expiresInMs).toBeGreaterThan(29 * 60 * 1000);
    expect(expiresInMs).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it("throws with the Postgres error message when the insert fails", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    insertMock.mockResolvedValue({ error: { message: "connection refused" } });

    await expect(getOrCreateTelegramLinkToken("vendor-1")).rejects.toThrow(
      "connection refused",
    );
  });
});

describe("disconnectTelegram", () => {
  it("deletes the vendor's own vendor_telegram row", async () => {
    await disconnectTelegram("vendor-1");

    expect(deleteMock).toHaveBeenCalled();
    expect(eqDeleteMock).toHaveBeenCalledWith("vendor_id", "vendor-1");
  });

  it("throws with the Postgres error message on failure", async () => {
    eqDeleteMock.mockResolvedValue({ error: { message: "RLS denied" } });

    await expect(disconnectTelegram("vendor-1")).rejects.toThrow("RLS denied");
  });
});
