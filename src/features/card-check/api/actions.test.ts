import { createServiceClient } from "@/lib/supabase/server";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpcMock, readProof, saveProof } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  readProof: vi.fn(),
  saveProof: vi.fn(),
}));
vi.mock("@/lib/customer-proof", async () => {
  const { z } = await import("zod");
  return {
    vendorIdSchema: z.string().uuid(),
    customerTokenSchema: z.string().regex(/^[a-f0-9]{32}$/),
    readCustomerProof: readProof,
    saveCustomerProof: saveProof,
  };
});
beforeEach(() => {
  readProof.mockResolvedValue("a".repeat(32));
  saveProof.mockResolvedValue(undefined);
});
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
  createServiceClient: vi.fn(async () => ({ rpc: rpcMock })),
}));
vi.mock("@merqo/ui", () => ({ qrSvg: vi.fn(async () => "<svg></svg>") }));

import {
  checkStatusAction,
  setCustomerBirthdayAction,
  selectPointsRewardAction,
  regenerateCardAction,
} from "./actions";
import { STATUS_IDLE } from "../types";
import { buildPlantConfig } from "@/lib/program-config";

const plantConfig = buildPlantConfig(8, "Free plant", "plant");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const baseRow = {
  program_id: "00550000-0000-0000-0000-000000000010",
  name: "Stamp Club",
  type: "stamp",
  config: {},
  state: {},
  stamp_count: 3,
  card_token: "a".repeat(32),
  reward_text: "Free coffee",
  stamps_required: 10,
  expiry_days: null,
  cycle_started_at: null,
  active: true,
  replaced_by_name: null,
  replaced_by_stamp_count: null,
  vendor_avatar_url: null,
};

describe("checkStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls guarded customer_join without a referral", async () => {
    rpcMock.mockResolvedValue({
      data: { cards: [baseRow], referral_credit: null },
      error: null,
    });

    await checkStatusAction(
      STATUS_IDLE,
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
      }),
    );

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("customer_join", {
      p_vendor: "00550000-0000-0000-0000-000000000001",
      p_phone: "+6591234567",
      p_token: "a".repeat(32),
      p_referral_code: null,
    });
  });

  it("passes the referral code through guarded customer_join", async () => {
    rpcMock.mockResolvedValue({
      data: { cards: [baseRow], referral_credit: null },
      error: null,
    });

    await checkStatusAction(
      STATUS_IDLE,
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
        ref: "abc123",
      }),
    );

    expect(rpcMock).toHaveBeenCalledWith("customer_join", {
      p_vendor: "00550000-0000-0000-0000-000000000001",
      p_phone: "+6591234567",
      p_referral_code: "abc123",
      p_token: "a".repeat(32),
    });
  });

  it("does not call apply_referral_credit for a stamp-type row (already credited inline by the RPC)", async () => {
    rpcMock.mockResolvedValue({
      data: { cards: [baseRow], referral_credit: null },
      error: null,
    });

    await checkStatusAction(
      STATUS_IDLE,
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
        ref: "abc123",
      }),
    );

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalledWith(
      "apply_referral_credit_checked",
      expect.anything(),
    );
  });

  it("finishes a pending non-stamp referral credit via apply_referral_credit, computed by the TS engine", async () => {
    const pendingRow = {
      ...baseRow,
      program_id: "00550000-0000-0000-0000-000000000020",
      type: "plant",
      config: plantConfig,
      state: {},
      referral_credit: {
        pending: true,
        referralHostId: "00550000-0000-0000-0000-000000000030",
        guestPhone: "+6591234567",
        programId: "p2",
        programType: "plant",
        programConfig: plantConfig,
        stampsRequired: 8,
        rewardText: "Free plant",
        hostPhone: "+6598765432",
        state: {},
        stampCount: 0,
        rewardCount: 0,
      },
    };
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "customer_join") {
        return {
          data: {
            cards: [pendingRow],
            referral_credit: pendingRow.referral_credit,
          },
          error: null,
        };
      }
      if (name === "referral_credit_snapshot") {
        return {
          data: {
            program: {
              type: "plant",
              config: plantConfig,
              stamps_required: 8,
              reward_text: "Free plant",
            },
            card: {
              state: {},
              stamp_count: 0,
              reward_count: 0,
              updated_at: "2026-10-08T00:00:00Z",
            },
          },
          error: null,
        };
      }
      if (name === "apply_referral_credit_checked") {
        return { data: true, error: null };
      }
      throw new Error(`unexpected rpc call: ${name}`);
    });

    await checkStatusAction(
      STATUS_IDLE,
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
        ref: "abc123",
      }),
    );

    expect(createServiceClient).toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith(
      "apply_referral_credit_checked",
      expect.objectContaining({
        p_referral_host_id: "00550000-0000-0000-0000-000000000030",
        p_guest_phone: "+6591234567",
        p_expected: expect.any(Object),
      }),
    );
  });

  it("logs (and does not throw or change the result) when apply_referral_credit fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const pendingRow = {
      ...baseRow,
      program_id: "00550000-0000-0000-0000-000000000020",
      type: "plant",
      config: plantConfig,
      state: {},
      referral_credit: {
        pending: true,
        referralHostId: "00550000-0000-0000-0000-000000000030",
        guestPhone: "+6591234567",
        programId: "p2",
        programType: "plant",
        programConfig: plantConfig,
        stampsRequired: 8,
        rewardText: "Free plant",
        hostPhone: "+6598765432",
        state: {},
        stampCount: 0,
        rewardCount: 0,
      },
    };
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "customer_join") {
        return {
          data: {
            cards: [pendingRow],
            referral_credit: pendingRow.referral_credit,
          },
          error: null,
        };
      }
      return { data: null, error: { message: "boom" } };
    });

    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
        ref: "abc123",
      }),
    );

    expect(result.status).toBe("found");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("setCustomerBirthdayAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes saved proof, normalized phone and birthday to the guarded RPC", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const result = await setCustomerBirthdayAction(
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
        month: "6",
        day: "15",
      }),
    );

    expect(result).toEqual({ success: true });
    expect(rpcMock).toHaveBeenCalledWith("customer_set_birthday", {
      p_vendor: "00550000-0000-0000-0000-000000000001",
      p_phone: "+6591234567",
      p_month: 6,
      p_day: 15,
      p_token: "a".repeat(32),
    });
  });

  it("rejects an invalid phone without calling the RPC", async () => {
    const result = await setCustomerBirthdayAction(
      formData({
        phone: "not-a-phone",
        vendor: "00550000-0000-0000-0000-000000000001",
        month: "6",
        day: "15",
      }),
    );
    expect(result).toEqual({
      success: false,
      error: "Enter a valid Singapore phone number.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing vendor without calling the RPC", async () => {
    const result = await setCustomerBirthdayAction(
      formData({ phone: "91234567", vendor: "", month: "6", day: "15" }),
    );
    expect(result).toEqual({ success: false, error: "Missing shop." });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each(["0", "13", "abc", ""])(
    "rejects an out-of-range or non-numeric month (%s) without calling the RPC",
    async (month) => {
      const result = await setCustomerBirthdayAction(
        formData({
          phone: "91234567",
          vendor: "00550000-0000-0000-0000-000000000001",
          month,
          day: "15",
        }),
      );
      expect(result).toEqual({ success: false, error: "Pick a month." });
      expect(rpcMock).not.toHaveBeenCalled();
    },
  );

  it.each(["0", "32", "abc", ""])(
    "rejects an out-of-range or non-numeric day (%s) without calling the RPC",
    async (day) => {
      const result = await setCustomerBirthdayAction(
        formData({
          phone: "91234567",
          vendor: "00550000-0000-0000-0000-000000000001",
          month: "6",
          day,
        }),
      );
      expect(result).toEqual({ success: false, error: "Pick a day." });
      expect(rpcMock).not.toHaveBeenCalled();
    },
  );

  it("returns a friendly error without logging customer details when the RPC fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await setCustomerBirthdayAction(
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
        month: "6",
        day: "15",
      }),
    );

    expect(result).toEqual({
      success: false,
      error: "Something went wrong.",
    });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("checkStatusAction surfaces active_vouchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders each active voucher's own QR", async () => {
    rpcMock.mockResolvedValue({
      data: {
        cards: [
          {
            ...baseRow,
            config: { variant: "points", redemption_mode: "catalog" },
            active_vouchers: [
              {
                id: "00550000-0000-0000-0000-000000000001",
                voucher_token: "b".repeat(32),
                reward_text: "Free drink",
                expires_at: null,
              },
            ],
          },
        ],
        referral_credit: null,
      },
      error: null,
    });
    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
      }),
    );
    expect(result.status).toBe("found");
    expect(result.cards?.[0].activeVouchers).toHaveLength(1);
    expect(result.cards?.[0].activeVouchers[0].rewardText).toBe("Free drink");
    expect(result.cards?.[0].activeVouchers[0].qr).toContain("<svg");
  });

  it("defaults to an empty array for a non-points card", async () => {
    rpcMock.mockResolvedValue({
      data: { cards: [baseRow], referral_credit: null },
      error: null,
    });
    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
      }),
    );
    expect(result.cards?.[0].activeVouchers).toEqual([]);
  });
});

describe("selectPointsRewardAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the new voucher's id/reward text/qr on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: "v2", voucher_token: "vtok2", reward_text: "Free meal" },
      error: null,
    });
    const res = await selectPointsRewardAction(
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
        program: "00550000-0000-0000-0000-000000000010",
        item_id: "b",
      }),
    );
    expect(rpcMock).toHaveBeenCalledWith("customer_select_points_reward", {
      p_program: "00550000-0000-0000-0000-000000000010",
      p_phone: "+6591234567",
      p_item_id: "b",
      p_vendor: "00550000-0000-0000-0000-000000000001",
      p_token: "a".repeat(32),
    });
    expect(res).toEqual({
      success: true,
      id: "v2",
      phone: "+6591234567",
      rewardText: "Free meal",
      qr: expect.stringContaining("<svg"),
    });
  });

  it("surfaces a friendly message when the balance is too low", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "insufficient_points" },
    });
    const res = await selectPointsRewardAction(
      formData({
        phone: "91234567",
        vendor: "00550000-0000-0000-0000-000000000001",
        program: "00550000-0000-0000-0000-000000000010",
        item_id: "b",
      }),
    );
    expect(res).toEqual({
      success: false,
      error: "Not enough points for that reward yet.",
    });
  });
});

describe("customer capability boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readProof.mockResolvedValue(null);
  });
  const vendor = "00550000-0000-0000-0000-000000000001";
  const program = "00550000-0000-0000-0000-000000000010";
  it("passes absent proof only to the DB enrollment guard and maps conflict to recovery", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "customer proof required" },
    });
    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({ vendor, phone: "91234567" }),
    );
    expect(rpcMock).toHaveBeenCalledWith("customer_join", {
      p_vendor: vendor,
      p_phone: "+6591234567",
      p_token: null,
      p_referral_code: null,
    });
    expect(result.status).toBe("error");
    expect(result.message).toContain("recover your card");
    expect(saveProof).not.toHaveBeenCalled();
  });
  it("uses a valid supplied saved card code and stores successful proof", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { cards: [baseRow], referral_credit: null },
      error: null,
    });
    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({ vendor, phone: "91234567", card_code: "a".repeat(32) }),
    );
    expect(result.status).toBe("found");
    expect(readProof).not.toHaveBeenCalled();
    expect(saveProof).toHaveBeenCalledWith(vendor, "a".repeat(32));
  });
  it("rejects malformed manual card proof before RPC", async () => {
    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({ vendor, phone: "91234567", card_code: "bad" }),
    );
    expect(result.status).toBe("error");
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it.each([
    { cards: "bad" },
    { cards: [{ ...baseRow, card_token: "bad" }] },
    { cards: [{ ...baseRow, program_id: "bad" }] },
  ])("fails closed on malformed customer payload", async (data) => {
    rpcMock.mockResolvedValueOnce({ data, error: null });
    expect(
      (
        await checkStatusAction(
          STATUS_IDLE,
          formData({ vendor, phone: "91234567" }),
        )
      ).status,
    ).toBe("error");
    expect(saveProof).not.toHaveBeenCalled();
  });
  it("returns a retry message when customer join transport rejects", async () => {
    rpcMock.mockRejectedValueOnce(new Error("transport"));
    expect(
      (
        await checkStatusAction(
          STATUS_IDLE,
          formData({ vendor, phone: "91234567" }),
        )
      ).status,
    ).toBe("error");
  });
  it("does not mutate birthdays without saved proof", async () => {
    expect(
      (
        await setCustomerBirthdayAction(
          formData({ vendor, phone: "91234567", month: "6", day: "15" }),
        )
      ).success,
    ).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("does not debit points without saved proof", async () => {
    expect(
      (
        await selectPointsRewardAction(
          formData({ vendor, program, phone: "91234567", item_id: "coffee" }),
        )
      ).success,
    ).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("does not reset an expired card without saved proof", async () => {
    expect(
      (
        await regenerateCardAction(
          formData({ vendor, program, phone: "91234567" }),
        )
      ).success,
    ).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("passes saved proof to expired-cycle reset and replaces it only on success", async () => {
    readProof.mockResolvedValue("a".repeat(32));
    rpcMock.mockResolvedValueOnce({
      data: { card_token: "b".repeat(32) },
      error: null,
    });
    expect(
      (
        await regenerateCardAction(
          formData({ vendor, program, phone: "91234567" }),
        )
      ).success,
    ).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("customer_reset_expired_card", {
      p_vendor: vendor,
      p_program: program,
      p_phone: "+6591234567",
      p_token: "a".repeat(32),
    });
    expect(saveProof).toHaveBeenCalledWith(vendor, "b".repeat(32));
  });
});

describe("customer card presentation and expired-cycle behavior", () => {
  const vendor = "00550000-0000-0000-0000-000000000001";
  const program = "00550000-0000-0000-0000-000000000010";
  beforeEach(() => {
    vi.clearAllMocks();
    readProof.mockResolvedValue("a".repeat(32));
  });
  it.each([
    { phone: "not-a-phone", vendor },
    { phone: "91234567", vendor: "" },
  ])("rejects invalid customer scope before RPC", async (input) => {
    expect((await checkStatusAction(STATUS_IDLE, formData(input))).status).toBe(
      "error",
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it("normalizes formatted phones and uses stamp_count rather than an empty state blob", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { cards: [baseRow], referral_credit: null },
      error: null,
    });
    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({ vendor, phone: "9123 4567" }),
    );
    expect(rpcMock).toHaveBeenCalledWith(
      "customer_join",
      expect.objectContaining({ p_phone: "+6591234567" }),
    );
    expect(result).toMatchObject({
      status: "found",
      phone: "+6591234567",
      vendorAvatarUrl: null,
      cards: [
        {
          programId: program,
          name: "Stamp Club",
          label: "3/10 stamps",
          view: { kind: "dots", filled: 3, total: 10, variant: "dots" },
          rewardReady: false,
          reward_text: "Free coffee",
          qr: "<svg></svg>",
          expired: false,
          active: true,
          replacedByName: null,
          carriedOverCount: null,
          activeVouchers: [],
        },
      ],
    });
  });
  it.each([
    {
      changes: { vendor_avatar_url: "https://example.test/vendor.webp" },
      expected: { vendorAvatarUrl: "https://example.test/vendor.webp" },
    },
    { changes: { active: false }, expected: { cards: [{ active: false }] } },
    {
      changes: { active: false, replaced_by_name: "Weekly Regular" },
      expected: { cards: [{ replacedByName: "Weekly Regular" }] },
    },
    {
      changes: { replaced_by_stamp_count: 6 },
      expected: { cards: [{ carriedOverCount: 6 }] },
    },
    {
      changes: { replaced_by_stamp_count: 0 },
      expected: { cards: [{ carriedOverCount: null }] },
    },
    {
      changes: { expiry_days: 30, cycle_started_at: "2020-01-01T00:00:00Z" },
      expected: { cards: [{ expired: true }] },
    },
  ])(
    "preserves customer presentation metadata",
    async ({ changes, expected }) => {
      rpcMock.mockResolvedValueOnce({
        data: { cards: [{ ...baseRow, ...changes }], referral_credit: null },
        error: null,
      });
      expect(
        await checkStatusAction(
          STATUS_IDLE,
          formData({ vendor, phone: "91234567" }),
        ),
      ).toMatchObject({ status: "found", ...expected });
    },
  );
  it("keeps stamp and plant programs as distinct cards", async () => {
    const other = "00550000-0000-0000-0000-000000000020";
    rpcMock.mockResolvedValueOnce({
      data: {
        cards: [
          baseRow,
          {
            ...baseRow,
            program_id: other,
            type: "plant",
            config: plantConfig,
            state: {
              growth: 1,
              last_visit_at: new Date().toISOString(),
              blooms: 0,
              bloomed: false,
            },
            stamp_count: 0,
            card_token: "b".repeat(32),
          },
        ],
        referral_credit: null,
      },
      error: null,
    });
    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({ vendor, phone: "91234567" }),
    );
    expect(result.status).toBe("found");
    expect(result.cards?.map((card) => card.programId)).toEqual([
      program,
      other,
    ]);
    expect(result.cards?.[0].view.kind).toBe("dots");
    expect(result.cards?.[1].view.kind).toBe("plant");
  });
  it("shows no rewards for a valid shop with no cards", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { cards: [], referral_credit: null },
      error: null,
    });
    expect(
      await checkStatusAction(
        STATUS_IDLE,
        formData({ vendor, phone: "91234567" }),
      ),
    ).toEqual({
      status: "none",
      message: "We couldn't find any rewards here.",
    });
  });
  it.each([
    { phone: "bad", program },
    { phone: "91234567", program: "" },
  ])("rejects invalid cycle reset before RPC", async (input) => {
    expect(
      (await regenerateCardAction(formData({ vendor, ...input }))).success,
    ).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: { message: "db down" } },
    { data: null, error: null },
  ])("does not replace proof when reset fails", async (response) => {
    rpcMock.mockResolvedValueOnce(response);
    expect(
      await regenerateCardAction(
        formData({ vendor, program, phone: "91234567" }),
      ),
    ).toEqual({ success: false, error: "Something went wrong." });
    expect(saveProof).not.toHaveBeenCalled();
  });
});
