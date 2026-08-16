import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateLinkToken, sendTelegramMessage } from "./telegram";

describe("sendTelegramMessage", () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  });

  afterEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
    vi.unstubAllGlobals();
  });

  it("POSTs to Telegram's sendMessage endpoint with the right JSON body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendTelegramMessage(12345, "Reward redeemed!");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-bot-token/sendMessage",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: 12345, text: "Reward redeemed!" }),
      },
    );
  });

  it("no-ops without throwing when TELEGRAM_BOT_TOKEN is unset", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendTelegramMessage(12345, "hi")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("catches and logs a fetch rejection instead of propagating", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(sendTelegramMessage(12345, "hi")).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "sendTelegramMessage failed",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});

describe("generateLinkToken", () => {
  it("returns a string matching Telegram's deep-link payload constraint", () => {
    const token = generateLinkToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it("returns a fresh token on every call", () => {
    expect(generateLinkToken()).not.toBe(generateLinkToken());
  });
});
