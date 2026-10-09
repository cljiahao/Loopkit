import { describe, it, expect, vi, beforeEach } from "vitest";

const { getProgramByIdMock, isProMock, rpcMock } = vi.hoisted(() => ({
  getProgramByIdMock: vi.fn(),
  isProMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1" } })),
}));

vi.mock("@/lib/program", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/program")>();
  return {
    ...actual,
    getProgramById: getProgramByIdMock,
    isPro: isProMock,
  };
});

const fromMock = vi.fn(() => {
  throw new Error("Replacement must not issue separate table writes");
});
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock, rpc: rpcMock })),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { changeTypeAction } from "@/app/setup/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const stampFields = {
  replacing: "old-id",
  type: "stamp",
  name: "New coffee card",
  stamps_required: "10",
  reward_text: "Free kopi",
  head_start: "false",
};

describe("changeTypeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "wheel" });
    isProMock.mockResolvedValue(false);
    rpcMock.mockResolvedValue({ data: "new-id", error: null });
  });

  it("rejects an unknown or unowned replacing id without any writes", async () => {
    getProgramByIdMock.mockResolvedValue(null);

    const res = await changeTypeAction({}, form(stampFields));

    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("replaces through one atomic RPC without separate writes", async () => {
    await expect(changeTypeAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith(
      "replace_program",
      expect.objectContaining({
        p_replacing: "old-id",
        p_type: "stamp",
        p_name: "New coffee card",
      }),
    );
  });

  it("returns an error without separate writes when replacement fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await changeTypeAction({}, form(stampFields))).error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a missing replacement result", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    expect((await changeTypeAction({}, form(stampFields))).error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects invalid config input without any writes", async () => {
    const res = await changeTypeAction({}, form({ ...stampFields, name: "" }));

    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("passes carry_over_stamps through on a same-type (stamp -> stamp) migration when ticked", async () => {
    getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "stamp" });

    await expect(
      changeTypeAction({}, form({ ...stampFields, carry_over_stamps: "true" })),
    ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "replace_program",
      expect.objectContaining({ p_carry_over_stamps: true }),
    );
  });

  it("ignores carry_over_stamps when the predecessor's type differs from the new type", async () => {
    getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "wheel" });

    await expect(
      changeTypeAction({}, form({ ...stampFields, carry_over_stamps: "true" })),
    ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "replace_program",
      expect.objectContaining({ p_carry_over_stamps: false }),
    );
  });

  it("defaults carry_over_stamps to false when not submitted", async () => {
    getProgramByIdMock.mockResolvedValue({ id: "old-id", type: "stamp" });

    await expect(changeTypeAction({}, form(stampFields))).rejects.toThrow(
      "REDIRECT:/dashboard?p=new-id",
    );

    expect(rpcMock).toHaveBeenCalledWith(
      "replace_program",
      expect.objectContaining({ p_carry_over_stamps: false }),
    );
  });

  it("passes reward_expiry_days through when the new type supports it", async () => {
    await expect(
      changeTypeAction({}, form({ ...stampFields, reward_expiry_days: "30" })),
    ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "replace_program",
      expect.objectContaining({ p_reward_expiry_days: 30 }),
    );
  });

  it("sends p_reward_expiry_days=null when the new type doesn't support it", async () => {
    isProMock.mockResolvedValue(true);

    await expect(
      changeTypeAction(
        {},
        form({
          replacing: "old-id",
          type: "lucky",
          name: "Lucky spin",
          reward_text: "Free kopi",
          win_percent: "10",
          pity_ceiling: "5",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "replace_program",
      expect.objectContaining({ p_reward_expiry_days: null }),
    );
  });

  it("blocks a free vendor changing to a non-stamp mechanic, without deactivating the old card", async () => {
    const res = await changeTypeAction(
      {},
      form({
        replacing: "old-id",
        type: "lucky",
        name: "Lucky spin",
        reward_text: "Free kopi",
        win_percent: "10",
        pity_ceiling: "5",
      }),
    );

    expect(res.error).toMatch(/needs pro/i);
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("blocks a free vendor changing into a premium stamp style", async () => {
    const res = await changeTypeAction(
      {},
      form({ ...stampFields, stamp_style: "seal" }),
    );

    expect(res.error).toMatch(/needs pro/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("allows a Pro vendor to change into any mechanic", async () => {
    isProMock.mockResolvedValue(true);

    await expect(
      changeTypeAction(
        {},
        form({
          replacing: "old-id",
          type: "lucky",
          name: "Lucky spin",
          reward_text: "Free kopi",
          win_percent: "10",
          pity_ceiling: "5",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/dashboard?p=new-id");

    expect(rpcMock).toHaveBeenCalledWith(
      "replace_program",
      expect.objectContaining({ p_type: "lucky" }),
    );
  });
});
