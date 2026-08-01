import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@supabase/ssr");

import { createClient } from "./client";
import { createBrowserClient } from "@supabase/ssr";

const mockCreateBrowserClient = vi.mocked(createBrowserClient);

describe("createClient — shared-session cookie domain", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN;
    mockCreateBrowserClient.mockClear();
  });

  it("scopes the auth cookie to .merqo.io when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is set", () => {
    mockCreateBrowserClient.mockReturnValue({} as any);
    process.env.NEXT_PUBLIC_AUTH_COOKIE_DOMAIN = ".merqo.io";
    createClient();
    const options = mockCreateBrowserClient.mock.calls[0]?.[2];
    expect(options?.cookieOptions).toEqual({ domain: ".merqo.io" });
  });

  it("omits cookieOptions.domain when NEXT_PUBLIC_AUTH_COOKIE_DOMAIN is unset (dev/preview)", () => {
    mockCreateBrowserClient.mockReturnValue({} as any);
    createClient();
    const options = mockCreateBrowserClient.mock.calls[0]?.[2];
    expect(options?.cookieOptions).toBeUndefined();
  });
});
