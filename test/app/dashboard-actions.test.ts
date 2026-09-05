import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireVendorMock,
  getProgramByIdMock,
  rpcMock,
  maybeSingleMock,
  notifySettingsMaybeSingleMock,
  notifyVendorMock,
  notifyCustomerByPhoneMock,
} = vi.hoisted(() => ({
  requireVendorMock: vi.fn(),
  getProgramByIdMock: vi.fn(),
  rpcMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  notifySettingsMaybeSingleMock: vi.fn(),
  notifyVendorMock: vi.fn(),
  notifyCustomerByPhoneMock: vi.fn(),
}));

vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("@/lib/program", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/program")>();
  return { ...actual, getProgramById: getProgramByIdMock };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// vendor_notify_settings is read via a single .eq("vendor_id", ...) chain —
// distinct from the cards lookup's double .eq() chain — so fromMock branches
// on the table name to route each call to its own mock.
const fromMock = vi.fn((table: string) => {
  if (table === "vendor_notify_settings") {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: notifySettingsMaybeSingleMock }),
      }),
    };
  }
  return {
    select: () => ({
      eq: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
    }),
  };
});
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock, from: fromMock })),
}));
vi.mock("@/lib/merqo-customer-notify", () => ({
  notifyVendor: notifyVendorMock,
  notifyCustomerByPhone: notifyCustomerByPhoneMock,
}));

import {
  stampAction,
  adjustStampAction,
  lookupAction,
  redeemAction,
  redeemPlantAction,
  applyPointsOffsetAction,
  resolveTokenAction,
  redeemVoucherAction,
} from "@/app/dashboard/actions";
import { buildPlantConfig } from "@/lib/program";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const program = {
  id: "p1",
  name: "Coffee",
  stamps_required: 10,
  reward_text: "Free kopi",
  type: "stamp",
  config: {},
  active: true,
};

describe("dashboard actions thread program_id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
  });

  it("stampAction resolves the program from program_id and stamps it", async () => {
    getProgramByIdMock.mockResolvedValue(program);
    rpcMock.mockResolvedValue({
      data: { id: "c1", phone: "+6591234567", stamp_count: 3 },
      error: null,
    });

    const res = await stampAction(
      form({ program_id: "p1", phone: "91234567" }),
    );

    expect(getProgramByIdMock).toHaveBeenCalledWith("p1");
    expect(rpcMock).toHaveBeenCalledWith("add_stamp", {
      p_program: "p1",
      p_phone: "+6591234567",
    });
    expect(res.success).toBe(true);
  });

  it("stampAction blocks an expired card without calling add_stamp", async () => {
    getProgramByIdMock.mockResolvedValue({ ...program, expiry_days: 30 });
    maybeSingleMock.mockResolvedValue({
      data: { cycle_started_at: "2020-01-01T00:00:00Z" },
      error: null,
    });

    const res = await stampAction(
      form({ program_id: "p1", phone: "91234567" }),
    );

    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("stampAction errors when the program_id is not owned (RLS null)", async () => {
    getProgramByIdMock.mockResolvedValue(null);

    const res = await stampAction(
      form({ program_id: "not-mine", phone: "91234567" }),
    );

    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("stampAction errors when program_id is missing without a DB lookup", async () => {
    const res = await stampAction(form({ phone: "91234567" }));
    expect(res.success).toBe(false);
    expect(getProgramByIdMock).not.toHaveBeenCalled();
  });

  it("adjustStampAction sends the delta and reason to adjust_stamp", async () => {
    getProgramByIdMock.mockResolvedValue(program);
    rpcMock.mockResolvedValue({
      data: { id: "c1", phone: "+6591234567", stamp_count: 5 },
      error: null,
    });

    const res = await adjustStampAction(
      form({
        program_id: "p1",
        phone: "91234567",
        delta: "3",
        reason: "Missed stamps from a system outage",
      }),
    );

    expect(rpcMock).toHaveBeenCalledWith("adjust_stamp", {
      p_program: "p1",
      p_phone: "+6591234567",
      p_delta: 3,
      p_reason: "Missed stamps from a system outage",
    });
    expect(res.success).toBe(true);
  });

  it("adjustStampAction rejects a zero delta without calling the RPC", async () => {
    getProgramByIdMock.mockResolvedValue(program);

    const res = await adjustStampAction(
      form({
        program_id: "p1",
        phone: "91234567",
        delta: "0",
        reason: "Oops",
      }),
    );

    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("adjustStampAction rejects a missing reason without calling the RPC", async () => {
    getProgramByIdMock.mockResolvedValue(program);

    const res = await adjustStampAction(
      form({ program_id: "p1", phone: "91234567", delta: "2", reason: "  " }),
    );

    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("adjustStampAction surfaces a not-found card as a friendly error", async () => {
    getProgramByIdMock.mockResolvedValue(program);
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "no card found for this customer" },
    });

    const res = await adjustStampAction(
      form({
        program_id: "p1",
        phone: "91234567",
        delta: "1",
        reason: "Correction",
      }),
    );

    expect(res.success).toBe(false);
  });

  it("lookupAction scopes the card read to the resolved program and returns type-aware progress", async () => {
    getProgramByIdMock.mockResolvedValue(program);
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "c1",
        phone: "+6591234567",
        stamp_count: 10,
        reward_count: 0,
        state: {},
      },
      error: null,
    });

    const res = await lookupAction(
      form({ program_id: "p1", phone: "91234567" }),
    );

    expect(getProgramByIdMock).toHaveBeenCalledWith("p1");
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.card.stamp_count).toBe(10);
      expect(res.progress.rewardReady).toBe(true);
      expect(res.progress.view).toEqual({
        kind: "dots",
        filled: 10,
        total: 10,
        variant: "dots",
      });
    }
  });
});

describe("redeemPlantAction returns fresh progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
  });

  it("shows the reset Seed stage immediately after redeeming a bloomed plant", async () => {
    const plantProgram = {
      id: "p2",
      name: "Sprout",
      stamps_required: 8,
      reward_text: "Free plant",
      type: "plant",
      config: buildPlantConfig(8, "Free plant"),
      active: true,
    };
    getProgramByIdMock.mockResolvedValue(plantProgram);
    maybeSingleMock.mockResolvedValue({
      data: {
        state: {
          growth: 8,
          last_visit_at: "2026-01-01T00:00:00Z",
          blooms: 0,
          bloomed: true,
        },
      },
      error: null,
    });
    rpcMock.mockResolvedValue({ data: null, error: null });

    const res = await redeemPlantAction(
      form({ program_id: "p2", phone: "91234567" }),
    );

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.progress.view).toEqual({
        kind: "plant",
        stage: 0,
        stageName: "Seed",
        totalStages: 5,
        wilting: false,
        variant: "plant",
        filled: 0,
        total: 8,
      });
      expect(res.progress.rewardReady).toBe(false);
    }
  });
});

describe("redeemAction vendor alert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
    rpcMock.mockResolvedValue({
      data: { id: "c1", phone: "+6591234567", stamp_count: 0 },
      error: null,
    });
    notifyVendorMock.mockResolvedValue(undefined);
    notifyCustomerByPhoneMock.mockResolvedValue(undefined);
    // Default: no vendor_notify_settings row at all — must still resolve to
    // "enabled" (backward compat for a vendor who never visited settings).
    notifySettingsMaybeSingleMock.mockResolvedValue({
      data: null,
      error: null,
    });
  });

  it("calls notifyVendor with the vendor's own id and a redemption message on a successful redeem", async () => {
    const res = await redeemAction(form({ card_id: "c1" }));

    expect(res.success).toBe(true);
    expect(notifyVendorMock).toHaveBeenCalledWith(
      "v1",
      expect.stringContaining("+6591234567"),
    );
  });

  it("still returns success when notifyVendor itself rejects", async () => {
    notifyVendorMock.mockRejectedValue(new Error("merqo down"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const res = await redeemAction(form({ card_id: "c1" }));

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.card).toEqual({
        id: "c1",
        phone: "+6591234567",
        stamp_count: 0,
      });
    }
    consoleError.mockRestore();
  });

  it("notifies the redeeming customer by phone via merqo alongside the vendor alert", async () => {
    const res = await redeemAction(form({ card_id: "c1" }));

    expect(res.success).toBe(true);
    expect(notifyCustomerByPhoneMock).toHaveBeenCalledWith(
      "v1",
      "+6591234567",
      expect.stringContaining("Reward redeemed"),
    );
  });

  it("still returns success when notifyCustomerByPhone itself rejects", async () => {
    notifyCustomerByPhoneMock.mockRejectedValue(new Error("merqo down"));

    const res = await redeemAction(form({ card_id: "c1" }));

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.card).toEqual({
        id: "c1",
        phone: "+6591234567",
        stamp_count: 0,
      });
    }
  });
});

describe("redeemAction customer notify vendor toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
    rpcMock.mockResolvedValue({
      data: { id: "c1", phone: "+6591234567", stamp_count: 0 },
      error: null,
    });
    notifyVendorMock.mockResolvedValue(undefined);
    notifyCustomerByPhoneMock.mockResolvedValue(undefined);
  });

  it("does not call notifyCustomerByPhone when the vendor's row explicitly disables it", async () => {
    notifySettingsMaybeSingleMock.mockResolvedValue({
      data: { customer_telegram_notify_enabled: false },
      error: null,
    });

    const res = await redeemAction(form({ card_id: "c1" }));

    expect(res.success).toBe(true);
    expect(notifyCustomerByPhoneMock).not.toHaveBeenCalled();
  });

  it("still calls notifyCustomerByPhone when the vendor's row explicitly enables it", async () => {
    notifySettingsMaybeSingleMock.mockResolvedValue({
      data: { customer_telegram_notify_enabled: true },
      error: null,
    });

    const res = await redeemAction(form({ card_id: "c1" }));

    expect(res.success).toBe(true);
    expect(notifyCustomerByPhoneMock).toHaveBeenCalledWith(
      "v1",
      "+6591234567",
      expect.stringContaining("Reward redeemed"),
    );
  });

  it("still calls notifyCustomerByPhone when the vendor has no vendor_notify_settings row at all (backward compat: no row means enabled)", async () => {
    notifySettingsMaybeSingleMock.mockResolvedValue({
      data: null,
      error: null,
    });

    const res = await redeemAction(form({ card_id: "c1" }));

    expect(res.success).toBe(true);
    expect(notifyCustomerByPhoneMock).toHaveBeenCalledWith(
      "v1",
      "+6591234567",
      expect.stringContaining("Reward redeemed"),
    );
  });
});

describe("stampAction rewardReady for points redemption modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
  });

  it("catalog mode: rewardReady only once the balance covers the cheapest item", async () => {
    getProgramByIdMock.mockResolvedValue({
      ...program,
      config: {
        variant: "points",
        redemption_mode: "catalog",
        catalog: [{ id: "a", label: "Free drink", cost: 100 }],
      },
    });
    rpcMock.mockResolvedValue({
      data: { id: "c1", phone: "+6591234567", stamp_count: 50 },
      error: null,
    });
    const notReady = await stampAction(
      form({ program_id: "p1", phone: "91234567" }),
    );
    expect(notReady.success && notReady.rewardReady).toBe(false);

    rpcMock.mockResolvedValue({
      data: { id: "c1", phone: "+6591234567", stamp_count: 100 },
      error: null,
    });
    const ready = await stampAction(
      form({ program_id: "p1", phone: "91234567" }),
    );
    expect(ready.success && ready.rewardReady).toBe(true);
  });
});

describe("applyPointsOffsetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
  });

  it("deducts points and returns the dollar figure", async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: "c1", phone: "+6591234567", stamp_count: 150, dollars: 1 }],
      error: null,
    });
    const res = await applyPointsOffsetAction(
      form({ card_id: "c1", points: "100" }),
    );
    expect(rpcMock).toHaveBeenCalledWith("apply_points_offset", {
      p_card: "c1",
      p_points: 100,
    });
    expect(res).toEqual({
      success: true,
      phone: "+6591234567",
      stampCount: 150,
      dollars: 1,
    });
  });

  it("rejects a non-integer or non-positive amount without a DB call", async () => {
    const res = await applyPointsOffsetAction(
      form({ card_id: "c1", points: "0" }),
    );
    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("resolveTokenAction falls back to a voucher lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
  });

  it("resolves a card token as before", async () => {
    rpcMock.mockResolvedValue({
      data: [{ phone: "+6591234567", program_id: "p1" }],
      error: null,
    });
    const res = await resolveTokenAction(form({ token: "cardtok" }));
    expect(res).toEqual({
      success: true,
      kind: "card",
      phone: "+6591234567",
      programId: "p1",
    });
  });

  it("falls back to voucher_by_token on a card miss", async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === "card_by_token")
        return Promise.resolve({ data: [], error: null });
      return Promise.resolve({
        data: [
          {
            phone: "+6591234567",
            reward_text: "Free drink",
            program_id: "p1",
          },
        ],
        error: null,
      });
    });
    const res = await resolveTokenAction(form({ token: "vouchtok" }));
    expect(res).toEqual({
      success: true,
      kind: "voucher",
      phone: "+6591234567",
      voucherToken: "vouchtok",
      rewardText: "Free drink",
    });
  });

  it("errors when neither a card nor a voucher matches", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const res = await resolveTokenAction(form({ token: "nope" }));
    expect(res.success).toBe(false);
  });
});

describe("redeemVoucherAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
  });

  it("redeems the voucher and returns the reward text", async () => {
    rpcMock.mockResolvedValue({
      data: { id: "v1", reward_text: "Free drink", status: "redeemed" },
      error: null,
    });
    const res = await redeemVoucherAction(form({ token: "tok123" }));
    expect(rpcMock).toHaveBeenCalledWith("redeem_voucher_by_token", {
      p_token: "tok123",
    });
    expect(res).toEqual({ success: true, rewardText: "Free drink" });
  });

  it("surfaces a friendly message for an already-redeemed voucher", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "already_redeemed" },
    });
    const res = await redeemVoucherAction(form({ token: "tok123" }));
    expect(res).toEqual({
      success: false,
      error: "This reward has already been redeemed.",
    });
  });

  it("surfaces a friendly message for an expired voucher", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "expired" },
    });
    const res = await redeemVoucherAction(form({ token: "tok123" }));
    expect(res).toEqual({
      success: false,
      error: "This reward has expired.",
    });
  });
});
