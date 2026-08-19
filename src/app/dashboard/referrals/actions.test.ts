import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  requireVendorMock,
  getProgramByIdMock,
  insertMock,
  selectMock,
  singleMock,
  revalidatePathMock,
  headersMock,
} = vi.hoisted(() => ({
  requireVendorMock: vi.fn(),
  getProgramByIdMock: vi.fn(),
  insertMock: vi.fn(),
  selectMock: vi.fn(),
  singleMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("@/lib/program", () => ({ getProgramById: getProgramByIdMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/qr", () => ({ qrSvg: vi.fn(async () => "<svg></svg>") }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    from: () => ({ insert: insertMock }),
  })),
}));

import { createReferralHostAction } from "./actions";
import { CREATE_REFERRAL_HOST_IDLE } from "./types";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createReferralHostAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_BASE_URL;
    requireVendorMock.mockResolvedValue({ user: { id: "vendor-1" } });
    getProgramByIdMock.mockResolvedValue({
      id: "p1",
      name: "Stamp Club",
      active: true,
    });
    insertMock.mockReturnValue({ select: selectMock });
    selectMock.mockReturnValue({ single: singleMock });
    singleMock.mockResolvedValue({
      data: { id: "rh1", referral_code: "abc123", guest_count: 0 },
      error: null,
    });
    headersMock.mockResolvedValue({
      get: (name: string) => (name === "host" ? "loopkit.test" : null),
    });
  });

  it("rejects when no program is picked", async () => {
    const result = await createReferralHostAction(
      CREATE_REFERRAL_HOST_IDLE,
      formData({ host_phone: "91234567" }),
    );
    expect(result).toEqual({ status: "error", message: "Pick a program." });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("rejects when the program isn't the vendor's own or isn't active", async () => {
    getProgramByIdMock.mockResolvedValue(null);
    const result = await createReferralHostAction(
      CREATE_REFERRAL_HOST_IDLE,
      formData({ program_id: "p1", host_phone: "91234567" }),
    );
    expect(result).toEqual({
      status: "error",
      message: "Pick an active program.",
    });
  });

  it("rejects an invalid host phone", async () => {
    const result = await createReferralHostAction(
      CREATE_REFERRAL_HOST_IDLE,
      formData({ program_id: "p1", host_phone: "123" }),
    );
    expect(result).toEqual({
      status: "error",
      message: "Enter a valid Singapore phone number.",
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("creates a referral host and returns its shareable link + QR", async () => {
    const result = await createReferralHostAction(
      CREATE_REFERRAL_HOST_IDLE,
      formData({
        program_id: "p1",
        host_phone: "91234567",
        label: "Sarah & Wei's Wedding",
      }),
    );

    expect(insertMock).toHaveBeenCalledWith({
      vendor_id: "vendor-1",
      program_id: "p1",
      host_phone: "+6591234567",
      label: "Sarah & Wei's Wedding",
    });
    expect(result).toEqual({
      status: "created",
      host: {
        id: "rh1",
        programId: "p1",
        programName: "Stamp Club",
        hostPhone: "+6591234567",
        label: "Sarah & Wei's Wedding",
        referralCode: "abc123",
        guestCount: 0,
        link: "https://loopkit.test/c?v=vendor-1&ref=abc123",
        qr: "<svg></svg>",
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/dashboard/referrals");
  });

  it("defaults an empty label to null", async () => {
    const result = await createReferralHostAction(
      CREATE_REFERRAL_HOST_IDLE,
      formData({ program_id: "p1", host_phone: "91234567", label: "" }),
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ label: null }),
    );
    expect(result.status === "created" && result.host.label).toBeNull();
  });

  it("returns an error when the insert fails", async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: "db down" },
    });
    const result = await createReferralHostAction(
      CREATE_REFERRAL_HOST_IDLE,
      formData({ program_id: "p1", host_phone: "91234567" }),
    );
    expect(result).toEqual({
      status: "error",
      message: "Something went wrong. Try again.",
    });
  });
});
