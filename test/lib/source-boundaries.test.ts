import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  service: vi.fn(),
  browser: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: mocks.service,
  createServerClient: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: mocks.browser }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/auth", () => ({ requireVendor: vi.fn() }));
vi.mock("@merqo/ui", () => ({
  storagePathFromPublicUrl: () => "owner/image.webp",
}));
vi.mock("@merqo/ui/legal", () => ({
  LEGAL_VERSIONS: { terms: "1", privacy: "1" },
  isLegalCurrent: (x: { terms: string; privacy: string }) =>
    x.terms === "1" && x.privacy === "1",
}));
import { checkLegalAcceptance } from "@/lib/legal-gate";
import { removeReplacedAvatar } from "@/lib/image-upload-adapter";
import { listAllUsers } from "@/lib/list-all-users";
import { saveProgramSchema } from "@/lib/program";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubEnv("MERQO_CUSTOMER_SECRET", "fixture");
});
describe("source boundary regressions", () => {
  it("fails closed when service client setup rejects", async () => {
    mocks.service.mockRejectedValue(new Error("offline"));
    expect(await checkLegalAcceptance("vendor@example.com")).toBe(false);
  });
  it("keeps valid remote acceptance when cache writing rejects", async () => {
    mocks.service.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null }) }),
        }),
        upsert: async () => {
          throw Error("cache offline");
        },
      }),
    });
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ terms: "1", privacy: "1" }),
    });
    expect(await checkLegalAcceptance("vendor@example.com")).toBe(true);
  });
  it("avatar cleanup tolerates synchronous client creation failure", async () => {
    mocks.browser.mockImplementation(() => {
      throw Error("missing config");
    });
    await expect(
      removeReplacedAvatar("https://example.com/image.webp"),
    ).resolves.toBeUndefined();
  });
  it("rejects an incomplete directory after the safety ceiling", async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        users: Array.from({ length: 1000 }, (_, i) => ({
          id: String(i),
          email: null,
        })),
      },
      error: null,
    });
    const result = await listAllUsers({
      auth: { admin: { listUsers } },
    } as unknown as Parameters<typeof listAllUsers>[0]);
    expect(result.data).toBeNull();
    expect(result.error?.message).toMatch(/pagination limit/);
    expect(listUsers).toHaveBeenCalledTimes(50);
  });
  it.each(["catalog", "offset"])(
    "rejects missing required points %s configuration",
    (mode) => {
      expect(
        saveProgramSchema.safeParse({
          type: "stamp",
          name: "Points",
          stamps_required: 10,
          reward_text: "Reward",
          head_start: "false",
          variant: "points",
          redemption_mode: mode,
        }).success,
      ).toBe(false);
    },
  );
});
