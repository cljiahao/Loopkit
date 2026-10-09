import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

const { createServerClient, cookies } = vi.hoisted(() => ({
  createServerClient: vi.fn().mockReturnValue({}),
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient }));
vi.mock("next/headers", () => ({ cookies }));

import {
  createServerClient as createOurServerClient,
  createServiceClient,
} from "./server";

describe("createServerClient — shared-session cookie domain", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
    createServerClient.mockClear();
  });

  it("scopes the auth cookie to .merqo.io when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is set", async () => {
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = ".merqo.io";
    await createOurServerClient();
    const options = createServerClient.mock.calls[0][2];
    expect(options.cookieOptions).toEqual({ domain: ".merqo.io" });
  });

  it("omits cookieOptions.domain when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is unset", async () => {
    await createOurServerClient();
    const options = createServerClient.mock.calls[0][2];
    expect(options.cookieOptions).toBeUndefined();
  });
});

describe("server cookie and service isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("reads request cookies and persists refreshed cookies", async () => {
    const set = vi.fn();
    cookies.mockResolvedValue({
      getAll: () => [{ name: "session", value: "old" }],
      set,
    });
    await createOurServerClient();
    const options = createServerClient.mock.calls[0][2];
    expect(options.cookies.getAll()).toEqual([
      { name: "session", value: "old" },
    ]);
    options.cookies.setAll([
      { name: "session", value: "new", options: { httpOnly: true } },
    ]);
    expect(set).toHaveBeenCalledWith("session", "new", { httpOnly: true });
  });
  it("tolerates readonly server component cookie stores", async () => {
    cookies.mockResolvedValue({
      getAll: () => [],
      set: vi.fn(() => {
        throw new Error("readonly");
      }),
    });
    await createOurServerClient();
    const options = createServerClient.mock.calls[0][2];
    expect(() =>
      options.cookies.setAll([{ name: "session", value: "new", options: {} }]),
    ).not.toThrow();
  });
  it("never reads request cookies for the privileged service client", async () => {
    await createServiceClient();
    expect(cookies).not.toHaveBeenCalled();
    const options = createServerClient.mock.calls[0][2];
    expect(options.cookies.getAll()).toEqual([]);
    expect(options.cookies.setAll([])).toBeUndefined();
    expect(options.auth).toEqual({
      autoRefreshToken: false,
      persistSession: false,
    });
    expect(options.db).toEqual({ schema: "loopkit" });
  });
});
