import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyCustomerByPhone } from "./merqo-customer-notify";

describe("notifyCustomerByPhone", () => {
  const originalBaseUrl = process.env.MERQO_BASE_URL;
  const originalSecret = process.env.MERQO_CUSTOMER_SECRET;

  beforeEach(() => {
    process.env.MERQO_BASE_URL = "https://merqo.example";
    process.env.MERQO_CUSTOMER_SECRET = "test-customer-secret";
  });

  afterEach(() => {
    process.env.MERQO_BASE_URL = originalBaseUrl;
    process.env.MERQO_CUSTOMER_SECRET = originalSecret;
    vi.unstubAllGlobals();
  });

  it("POSTs vendor_id/phone/message (no notify_ref) with the bearer secret to notify-customer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await notifyCustomerByPhone("vendor-1", "+6591234567", "Reward redeemed!");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://merqo.example/api/merqo/notify-customer");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer test-customer-secret",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      vendor_id: "vendor-1",
      phone: "+6591234567",
      message: "Reward redeemed!",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("never throws on a non-2xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      notifyCustomerByPhone("vendor-1", "+6591234567", "hi"),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("never throws on a network error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      notifyCustomerByPhone("vendor-1", "+6591234567", "hi"),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "notifyCustomerByPhone failed",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("never throws on a timeout (AbortError)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      Object.assign(new Error("The operation was aborted"), {
        name: "TimeoutError",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      notifyCustomerByPhone("vendor-1", "+6591234567", "hi"),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("no-ops without throwing when MERQO_BASE_URL is unset", async () => {
    delete process.env.MERQO_BASE_URL;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      notifyCustomerByPhone("vendor-1", "+6591234567", "hi"),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no-ops without throwing when MERQO_CUSTOMER_SECRET is unset", async () => {
    delete process.env.MERQO_CUSTOMER_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      notifyCustomerByPhone("vendor-1", "+6591234567", "hi"),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
