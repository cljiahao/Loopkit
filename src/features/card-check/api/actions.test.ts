import { describe, it, expect, vi, beforeEach } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));
vi.mock("@/lib/qr", () => ({ qrSvg: vi.fn(async () => "<svg></svg>") }));

import { checkStatusAction, setCustomerBirthdayAction } from "./actions";
import { STATUS_IDLE } from "../types";
import { buildPlantConfig } from "@/lib/program-config";

const plantConfig = buildPlantConfig(8, "Free plant", "plant");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const baseRow = {
  program_id: "p1",
  name: "Stamp Club",
  type: "stamp",
  config: {},
  state: {},
  stamp_count: 3,
  card_token: "tok",
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

  it("calls vendor_join when no ref is present (unchanged existing behavior)", async () => {
    rpcMock.mockResolvedValue({ data: [baseRow], error: null });

    await checkStatusAction(
      STATUS_IDLE,
      formData({ phone: "91234567", vendor: "v1" }),
    );

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("vendor_join", {
      p_vendor: "v1",
      p_phone: "+6591234567",
    });
  });

  it("calls vendor_join_referred with the referral code when ref is present", async () => {
    rpcMock.mockResolvedValue({ data: [baseRow], error: null });

    await checkStatusAction(
      STATUS_IDLE,
      formData({ phone: "91234567", vendor: "v1", ref: "abc123" }),
    );

    expect(rpcMock).toHaveBeenCalledWith("vendor_join_referred", {
      p_vendor: "v1",
      p_phone: "+6591234567",
      p_referral_code: "abc123",
    });
  });

  it("does not call apply_referral_credit for a stamp-type row (already credited inline by the RPC)", async () => {
    rpcMock.mockResolvedValue({ data: [baseRow], error: null });

    await checkStatusAction(
      STATUS_IDLE,
      formData({ phone: "91234567", vendor: "v1", ref: "abc123" }),
    );

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalledWith(
      "apply_referral_credit",
      expect.anything(),
    );
  });

  it("finishes a pending non-stamp referral credit via apply_referral_credit, computed by the TS engine", async () => {
    const pendingRow = {
      ...baseRow,
      program_id: "p2",
      type: "plant",
      config: plantConfig,
      state: {},
      referral_credit: {
        pending: true,
        referralHostId: "rh1",
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
      if (name === "vendor_join_referred") {
        return { data: [pendingRow], error: null };
      }
      if (name === "apply_referral_credit") {
        return { data: {}, error: null };
      }
      throw new Error(`unexpected rpc call: ${name}`);
    });

    await checkStatusAction(
      STATUS_IDLE,
      formData({ phone: "91234567", vendor: "v1", ref: "abc123" }),
    );

    expect(rpcMock).toHaveBeenCalledWith(
      "apply_referral_credit",
      expect.objectContaining({
        p_referral_host_id: "rh1",
        p_guest_phone: "+6591234567",
        p_kind: "visit",
      }),
    );
  });

  it("logs (and does not throw or change the result) when apply_referral_credit fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const pendingRow = {
      ...baseRow,
      program_id: "p2",
      type: "plant",
      config: plantConfig,
      state: {},
      referral_credit: {
        pending: true,
        referralHostId: "rh1",
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
      if (name === "vendor_join_referred") {
        return { data: [pendingRow], error: null };
      }
      return { data: null, error: { message: "boom" } };
    });

    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({ phone: "91234567", vendor: "v1", ref: "abc123" }),
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

  it("calls set_customer_birthday with the normalized phone and numeric month/day", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const result = await setCustomerBirthdayAction(
      formData({ phone: "91234567", vendor: "v1", month: "6", day: "15" }),
    );

    expect(result).toEqual({ success: true });
    expect(rpcMock).toHaveBeenCalledWith("set_customer_birthday", {
      p_vendor: "v1",
      p_phone: "+6591234567",
      p_birth_month: 6,
      p_birth_day: 15,
    });
  });

  it("rejects an invalid phone without calling the RPC", async () => {
    const result = await setCustomerBirthdayAction(
      formData({ phone: "not-a-phone", vendor: "v1", month: "6", day: "15" }),
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
        formData({ phone: "91234567", vendor: "v1", month, day: "15" }),
      );
      expect(result).toEqual({ success: false, error: "Pick a month." });
      expect(rpcMock).not.toHaveBeenCalled();
    },
  );

  it.each(["0", "32", "abc", ""])(
    "rejects an out-of-range or non-numeric day (%s) without calling the RPC",
    async (day) => {
      const result = await setCustomerBirthdayAction(
        formData({ phone: "91234567", vendor: "v1", month: "6", day }),
      );
      expect(result).toEqual({ success: false, error: "Pick a day." });
      expect(rpcMock).not.toHaveBeenCalled();
    },
  );

  it("returns a friendly error and logs when the RPC fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    const result = await setCustomerBirthdayAction(
      formData({ phone: "91234567", vendor: "v1", month: "6", day: "15" }),
    );

    expect(result).toEqual({
      success: false,
      error: "Something went wrong.",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
