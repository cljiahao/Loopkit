import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  maybeSingleMock,
  eqSelectMock,
  selectMock,
  upsertMock,
  eqDeleteMock,
  deleteMock,
  fromMock,
  createServiceClientMock,
  sendTelegramMessageMock,
} = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  eqSelectMock: vi.fn(),
  selectMock: vi.fn(),
  upsertMock: vi.fn(),
  eqDeleteMock: vi.fn(),
  deleteMock: vi.fn(),
  fromMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  sendTelegramMessageMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: createServiceClientMock,
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegramMessage: sendTelegramMessageMock,
}));

function makeRequest(body: unknown, secret?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (secret !== undefined) {
    headers.set("x-telegram-bot-api-secret-token", secret);
  }
  return new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const startUpdate = (token: string) => ({
  update_id: 1,
  message: {
    message_id: 1,
    chat: { id: 555 },
    text: `/start ${token}`,
  },
});

beforeEach(() => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-secret";
  maybeSingleMock.mockReset().mockResolvedValue({ data: null, error: null });
  eqSelectMock.mockReset().mockReturnValue({ maybeSingle: maybeSingleMock });
  selectMock.mockReset().mockReturnValue({ eq: eqSelectMock });
  upsertMock.mockReset().mockResolvedValue({ error: null });
  eqDeleteMock.mockReset().mockResolvedValue({ error: null });
  deleteMock.mockReset().mockReturnValue({ eq: eqDeleteMock });
  fromMock.mockReset().mockImplementation((table: string) => {
    if (table === "telegram_link_tokens") {
      return { select: selectMock, delete: deleteMock };
    }
    if (table === "vendor_telegram") {
      return { upsert: upsertMock };
    }
    throw new Error(`unexpected table ${table}`);
  });
  createServiceClientMock.mockReset().mockResolvedValue({ from: fromMock });
  sendTelegramMessageMock.mockReset().mockResolvedValue(undefined);
});

describe("POST /api/telegram/webhook", () => {
  it("rejects a request with a missing secret-token header", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest(startUpdate("tok1")));

    expect(res.status).toBe(401);
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret-token header", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest(startUpdate("tok1"), "wrong-secret"));

    expect(res.status).toBe(401);
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("links a valid unexpired token: upserts vendor_telegram, deletes the token, sends a confirmation", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        vendor_id: "vendor-1",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      error: null,
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest(startUpdate("tok1"), "test-secret"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(selectMock).toHaveBeenCalled();
    expect(eqSelectMock).toHaveBeenCalledWith("token", "tok1");
    expect(upsertMock).toHaveBeenCalledWith(
      { vendor_id: "vendor-1", chat_id: 555 },
      { onConflict: "vendor_id" },
    );
    expect(deleteMock).toHaveBeenCalled();
    expect(eqDeleteMock).toHaveBeenCalledWith("token", "tok1");
    expect(sendTelegramMessageMock).toHaveBeenCalledWith(
      555,
      expect.any(String),
    );
  });

  it("rejects an expired token without writing anything", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        vendor_id: "vendor-1",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    });

    const { POST } = await import("./route");
    const res = await POST(makeRequest(startUpdate("tok1"), "test-secret"));

    expect(res.status).toBe(200);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(sendTelegramMessageMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown token without writing anything", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(startUpdate("no-such-token"), "test-secret"),
    );

    expect(res.status).toBe(200);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("responds 200 without writing when the token lookup itself errors", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { message: "connection refused" },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const { POST } = await import("./route");
    const res = await POST(makeRequest(startUpdate("tok1"), "test-secret"));

    expect(res.status).toBe(200);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("ignores non-/start messages, responding 200 without touching the database", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(
        {
          update_id: 2,
          message: { message_id: 2, chat: { id: 555 }, text: "hello" },
        },
        "test-secret",
      ),
    );

    expect(res.status).toBe(200);
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it("responds 200 on a non-Telegram-shaped payload instead of 500", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "test-secret",
      },
      body: "not json",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
  });
});
