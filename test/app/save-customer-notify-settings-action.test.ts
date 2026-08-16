import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireVendorMock, upsertMock } = vi.hoisted(() => ({
  requireVendorMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock("@/features/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const fromMock = vi.fn(() => ({ upsert: upsertMock }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}));

import { saveCustomerNotifySettingsAction } from "@/app/dashboard/actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("saveCustomerNotifySettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
    upsertMock.mockResolvedValue({ error: null });
  });

  it("upserts customer_telegram_notify_enabled: true when the switch is on", async () => {
    const res = await saveCustomerNotifySettingsAction(form({ enabled: "on" }));

    expect(res).toEqual({ success: true, enabled: true });
    expect(fromMock).toHaveBeenCalledWith("vendor_notify_settings");
    expect(upsertMock).toHaveBeenCalledWith(
      { vendor_id: "v1", customer_telegram_notify_enabled: true },
      { onConflict: "vendor_id" },
    );
  });

  it("upserts customer_telegram_notify_enabled: false when the switch is off (unchecked checkboxes submit no field at all)", async () => {
    const res = await saveCustomerNotifySettingsAction(form({}));

    expect(res).toEqual({ success: true, enabled: false });
    expect(upsertMock).toHaveBeenCalledWith(
      { vendor_id: "v1", customer_telegram_notify_enabled: false },
      { onConflict: "vendor_id" },
    );
  });

  it("returns a generic error and does not throw when the upsert fails", async () => {
    upsertMock.mockResolvedValue({ error: { message: "db down" } });

    const res = await saveCustomerNotifySettingsAction(form({ enabled: "on" }));

    expect(res).toEqual({ success: false, error: "Something went wrong." });
  });
});
