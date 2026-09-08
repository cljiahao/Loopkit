import { describe, it, expect, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ rpc: rpcMock })),
}));

import {
  programInputSchema,
  saveProgramSchema,
  canPrepProgram,
  getEntitlement,
  buildProgramFields,
  getVoucherByToken,
} from "@/lib/program";

describe("programInputSchema", () => {
  it("accepts a valid program", () => {
    const result = programInputSchema.safeParse({
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "Free kopi",
    });
    expect(result.success).toBe(true);
  });

  it("rejects stamps_required below 2", () => {
    const result = programInputSchema.safeParse({
      name: "Coffee card",
      stamps_required: 1,
      reward_text: "Free kopi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects stamps_required above 20", () => {
    const result = programInputSchema.safeParse({
      name: "Coffee card",
      stamps_required: 21,
      reward_text: "Free kopi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty name", () => {
    const result = programInputSchema.safeParse({
      name: "",
      stamps_required: 10,
      reward_text: "Free kopi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty reward_text", () => {
    const result = programInputSchema.safeParse({
      name: "Coffee card",
      stamps_required: 10,
      reward_text: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("canPrepProgram", () => {
  it("allows a free vendor to prep a second live-in-play program", () => {
    expect(canPrepProgram(getEntitlement(false), 1)).toBe(true);
  });
  it("blocks a free vendor already at 2 live-in-play programs", () => {
    expect(canPrepProgram(getEntitlement(false), 2)).toBe(false);
  });
  it("never blocks a Pro vendor regardless of count", () => {
    expect(canPrepProgram(getEntitlement(true), 50)).toBe(true);
  });
});

describe("saveProgramSchema reward_expiry_days", () => {
  it("accepts a stamp program with reward_expiry_days set", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      reward_expiry_days: "30",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.reward_expiry_days).toBe(30);
    }
  });

  it("defaults to undefined (never expires) when left blank", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      reward_expiry_days: "",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.reward_expiry_days).toBeUndefined();
    }
  });

  it("rejects a value outside 1..3650", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      reward_expiry_days: "3651",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a plant program with reward_expiry_days set", () => {
    const result = saveProgramSchema.safeParse({
      type: "plant",
      name: "Sprout",
      reward_text: "Free plant",
      visits_to_bloom: "8",
      head_start: "false",
      reward_expiry_days: "14",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "plant") {
      expect(result.data.reward_expiry_days).toBe(14);
    }
  });

  it("lucky programs don't accept reward_expiry_days (not in that variant's schema)", () => {
    const result = saveProgramSchema.safeParse({
      type: "lucky",
      name: "Lucky Tap",
      reward_text: "Free item",
      win_percent: "20",
      pity_ceiling: "10",
      reward_expiry_days: "30",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "lucky") {
      expect("reward_expiry_days" in result.data).toBe(false);
    }
  });
});

describe("saveProgramSchema reward_cost_dollars", () => {
  it("accepts an optional reward_cost_dollars on a stamp program and coerces it", () => {
    const parsed = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free coffee",
      head_start: "false",
      reward_cost_dollars: "1.20",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "stamp") {
      expect(parsed.data.reward_cost_dollars).toBeCloseTo(1.2, 10);
    }
  });

  it("treats a blank reward_cost_dollars as unset", () => {
    const parsed = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free coffee",
      head_start: "false",
      reward_cost_dollars: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "stamp") {
      expect(parsed.data.reward_cost_dollars).toBeUndefined();
    }
  });

  it("rejects a negative reward_cost_dollars", () => {
    const parsed = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free coffee",
      head_start: "false",
      reward_cost_dollars: "-1",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("saveProgramSchema stamp_mark", () => {
  it("accepts a stamp program with a preset mark", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_mark_mode: "preset",
      stamp_mark_preset: "coffee",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.stamp_mark_mode).toBe("preset");
      expect(result.data.stamp_mark_preset).toBe("coffee");
    }
  });

  it("defaults both to undefined when left blank", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_mark_mode: "",
      stamp_mark_preset: "",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.stamp_mark_mode).toBeUndefined();
      expect(result.data.stamp_mark_preset).toBeUndefined();
    }
  });

  it("rejects an unknown mode", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_mark_mode: "logo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown preset", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_mark_mode: "preset",
      stamp_mark_preset: "mascot",
    });
    expect(result.success).toBe(false);
  });
});

describe("saveProgramSchema stamp_style/stamp_color", () => {
  it("accepts a stamp program with a style and a hex color", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_style: "seal",
      stamp_color: "#8a2436",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.stamp_style).toBe("seal");
      expect(result.data.stamp_color).toBe("#8a2436");
    }
  });

  it("defaults both to undefined when left blank", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_style: "",
      stamp_color: "",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.stamp_style).toBeUndefined();
      expect(result.data.stamp_color).toBeUndefined();
    }
  });

  it("rejects an unknown style", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_style: "glitter",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a color that isn't a 6-digit hex", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_color: "red",
    });
    expect(result.success).toBe(false);
  });
});

describe("buildProgramFields stamp_style/stamp_color", () => {
  it("carries the chosen style/color into config", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_style: "punch",
      stamp_color: "#8a2436",
    });
    const { config } = buildProgramFields(parsed);
    expect(
      (config as { stamp_style?: unknown; stamp_color?: unknown }).stamp_style,
    ).toBe("punch");
    expect(
      (config as { stamp_style?: unknown; stamp_color?: unknown }).stamp_color,
    ).toBe("#8a2436");
  });

  it("leaves both undefined when unset", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
    });
    const { config } = buildProgramFields(parsed);
    expect((config as { stamp_style?: unknown }).stamp_style).toBeUndefined();
    expect((config as { stamp_color?: unknown }).stamp_color).toBeUndefined();
  });
});

describe("buildProgramFields stamp_mark", () => {
  it("defaults config.stamp_mark to mode 'dot' when unset", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
    });
    const { config } = buildProgramFields(parsed);
    expect((config as { stamp_mark?: unknown }).stamp_mark).toEqual({
      mode: "dot",
      preset: undefined,
    });
  });

  it("carries the chosen mode/preset into config.stamp_mark", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_mark_mode: "preset",
      stamp_mark_preset: "gift",
    });
    const { config } = buildProgramFields(parsed);
    expect((config as { stamp_mark?: unknown }).stamp_mark).toEqual({
      mode: "preset",
      preset: "gift",
    });
  });
});

describe("saveProgramSchema points redemption fields", () => {
  it("accepts a catalog-mode points program", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee Points",
      stamps_required: "500",
      reward_text: "unused",
      head_start: "false",
      variant: "points",
      redemption_mode: "catalog",
      catalog: JSON.stringify([
        { label: "Free drink", cost: 100 },
        { label: "Free meal", cost: 300 },
      ]),
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.redemption_mode).toBe("catalog");
      expect(result.data.catalog).toHaveLength(2);
    }
  });

  it("accepts an offset-mode points program", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee Points",
      stamps_required: "500",
      reward_text: "unused",
      head_start: "false",
      variant: "points",
      redemption_mode: "offset",
      offset_rate_points: "100",
      offset_rate_dollars: "1",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.redemption_mode).toBe("offset");
      expect(result.data.offset_rate_points).toBe(100);
      expect(result.data.offset_rate_dollars).toBe(1);
    }
  });

  it("rejects a catalog with fewer than 2 items", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee Points",
      stamps_required: "500",
      reward_text: "unused",
      head_start: "false",
      variant: "points",
      redemption_mode: "catalog",
      catalog: JSON.stringify([{ label: "Free drink", cost: 100 }]),
    });
    expect(result.success).toBe(false);
  });
});

describe("getVoucherByToken", () => {
  it("returns the resolved voucher row", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          program_id: "p1",
          card_id: "c1",
          voucher_id: "v1",
          phone: "+6591234567",
          reward_text: "Free drink",
          status: "active",
        },
      ],
      error: null,
    });
    const result = await getVoucherByToken("tok123");
    expect(rpcMock).toHaveBeenCalledWith("voucher_by_token", {
      p_token: "tok123",
    });
    expect(result).toEqual({
      programId: "p1",
      cardId: "c1",
      voucherId: "v1",
      phone: "+6591234567",
      rewardText: "Free drink",
      status: "active",
    });
  });

  it("returns null when no voucher matches", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const result = await getVoucherByToken("nope");
    expect(result).toBeNull();
  });
});

describe("buildProgramFields points redemption modes", () => {
  it("catalog mode: assigns each item a fresh id and sets stamps_required to the highest cost", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee Points",
      stamps_required: "500",
      reward_text: "unused",
      head_start: "false",
      variant: "points",
      redemption_mode: "catalog",
      catalog: JSON.stringify([
        { label: "Free drink", cost: 100 },
        { label: "Free meal", cost: 300 },
      ]),
    });
    const { config, stampsRequired } = buildProgramFields(parsed);
    const c = config as {
      redemption_mode?: string;
      catalog?: { id: string; label: string; cost: number }[];
    };
    expect(c.redemption_mode).toBe("catalog");
    expect(c.catalog).toHaveLength(2);
    expect(c.catalog?.every((item) => typeof item.id === "string")).toBe(true);
    expect(stampsRequired).toBe(300);
  });

  it("offset mode: builds config.offset_rate and sets stamps_required to the rate's points", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee Points",
      stamps_required: "500",
      reward_text: "unused",
      head_start: "false",
      variant: "points",
      redemption_mode: "offset",
      offset_rate_points: "100",
      offset_rate_dollars: "1",
    });
    const { config, stampsRequired } = buildProgramFields(parsed);
    expect((config as { offset_rate?: unknown }).offset_rate).toEqual({
      points: 100,
      dollars: 1,
    });
    expect(stampsRequired).toBe(100);
  });

  it("leaves redemption_mode/catalog/offset_rate undefined for a non-points stamp program", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
    });
    const { config } = buildProgramFields(parsed);
    const c = config as {
      redemption_mode?: unknown;
      catalog?: unknown;
      offset_rate?: unknown;
    };
    expect(c.redemption_mode).toBeUndefined();
    expect(c.catalog).toBeUndefined();
    expect(c.offset_rate).toBeUndefined();
  });
});
