// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/admin-data", () => ({
  listAdminAudit: vi.fn(async () => [
    {
      id: "a1",
      admin_id: "admin-1",
      actor_email: "admin@merqo.dev",
      action: "set_vendor_pro",
      target_id: "vendor-1",
      detail: { pro: true },
      created_at: "2026-08-20T00:00:00Z",
    },
    {
      id: "a2",
      admin_id: "vendor-2",
      actor_email: null,
      action: "merqo_vendor_provision",
      target_id: "vendor-2",
      detail: { actor: "merqo_system", already_existed: false, plan: "free" },
      created_at: "2026-08-19T00:00:00Z",
    },
    {
      id: "a3",
      admin_id: "unknown-admin",
      actor_email: null,
      action: "some_future_action",
      target_id: null,
      detail: null,
      created_at: "2026-08-18T00:00:00Z",
    },
  ]),
}));

import AdminActivityPage from "./page";

describe("AdminActivityPage", () => {
  it("renders each audit row with a human action label and resolved actor", async () => {
    render(await AdminActivityPage());

    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Vendor Pro status changed")).toBeInTheDocument();
    expect(screen.getByText("admin@merqo.dev")).toBeInTheDocument();
    expect(screen.getByText("pro: true")).toBeInTheDocument();
  });

  it("labels a merqo-system action distinctly from a real admin", async () => {
    render(await AdminActivityPage());

    expect(screen.getByText("Vendor provisioned (merqo)")).toBeInTheDocument();
    expect(screen.getByText("Merqo (system)")).toBeInTheDocument();
    expect(
      screen.getByText('already_existed: false, plan: "free"'),
    ).toBeInTheDocument();
  });

  it("falls back to the raw action string and admin id when neither is recognized", async () => {
    render(await AdminActivityPage());

    expect(screen.getByText("some_future_action")).toBeInTheDocument();
    expect(screen.getByText("unknown-admin")).toBeInTheDocument();
  });

  it("shows an empty state when there is no audit history yet", async () => {
    const { listAdminAudit } = await import("@/lib/admin-data");
    vi.mocked(listAdminAudit).mockResolvedValueOnce([]);
    render(await AdminActivityPage());
    expect(screen.getByText("No activity recorded yet.")).toBeInTheDocument();
  });
});
