import { describe, it, expect, vi, beforeEach } from "vitest";

const headersMock = vi.fn(
  async () => new Map([["x-forwarded-for", "1.2.3.4"]]),
);
vi.mock("next/headers", () => ({ headers: headersMock }));

const ORIGINAL_ENV = process.env;

describe("allowRequest", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Map([["x-forwarded-for", "1.2.3.4"]]));
    process.env = { ...ORIGINAL_ENV };
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("allows every request when Upstash env vars are absent (fail-open)", async () => {
    const { allowRequest } = await import("@/lib/rate-limit");
    expect(await allowRequest("bucket")).toBe(true);
  });

  it("uses the configured limiter, keyed by bucket:ip", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const limitMock = vi.fn(async () => ({ success: false }));
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: Object.assign(
        vi.fn(() => ({ limit: limitMock })),
        { slidingWindow: vi.fn(() => "window-config") },
      ),
    }));
    vi.doMock("@upstash/redis", () => ({ Redis: vi.fn() }));

    const { allowRequest } = await import("@/lib/rate-limit");
    const result = await allowRequest("c-check");

    expect(result).toBe(false);
    expect(limitMock).toHaveBeenCalledWith("c-check:1.2.3.4");
  });

  it("falls back to 'unknown' when x-forwarded-for is missing", async () => {
    headersMock.mockResolvedValue(new Map());
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
    const limitMock = vi.fn(async () => ({ success: true }));
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: Object.assign(
        vi.fn(() => ({ limit: limitMock })),
        { slidingWindow: vi.fn(() => "window-config") },
      ),
    }));
    vi.doMock("@upstash/redis", () => ({ Redis: vi.fn() }));

    const { allowRequest } = await import("@/lib/rate-limit");
    await allowRequest("c-check");

    expect(limitMock).toHaveBeenCalledWith("c-check:unknown");
  });
});
