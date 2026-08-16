// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1" } })),
}));

const programs = [
  { id: "p1", name: "Coffee Stamps", type: "stamp" },
  { id: "p2", name: "Lucky Wheel", type: "wheel" },
];

vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => programs),
  isPro: vi.fn(async () => false),
}));

const qkitMaybeSingle = vi.fn(
  async (): Promise<{
    data: { program_id: string; enabled: boolean } | null;
  }> => ({ data: null }),
);
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: qkitMaybeSingle,
        })),
      })),
    })),
  })),
}));

vi.mock("@/app/dashboard/qkit-earn-settings", () => ({
  QkitEarnSettings: (props: {
    programs: { id: string; name: string }[];
    current: { programId: string; enabled: boolean } | null;
    isPro: boolean;
  }) => (
    <div data-testid="qkit-earn-settings">
      {props.programs.map((p) => p.name).join(",")} / current:
      {props.current ? props.current.programId : "none"} / pro:
      {String(props.isPro)}
    </div>
  ),
}));

import SettingsPage from "./page";

beforeEach(() => {
  qkitMaybeSingle.mockReset().mockResolvedValue({ data: null });
});

describe("SettingsPage", () => {
  it("renders the heading and only the stamp-type programs, with no existing config", async () => {
    render(await SettingsPage());

    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    const panel = screen.getByTestId("qkit-earn-settings");
    expect(panel).toHaveTextContent("Coffee Stamps");
    expect(panel).not.toHaveTextContent("Lucky Wheel");
    expect(panel).toHaveTextContent("current:none");
    expect(panel).toHaveTextContent("pro:false");
  });

  it("passes the existing qkit earn config through when one is already saved", async () => {
    qkitMaybeSingle.mockResolvedValueOnce({
      data: { program_id: "p1", enabled: true },
    });
    const { isPro } = await import("@/lib/program");
    vi.mocked(isPro).mockResolvedValueOnce(true);

    render(await SettingsPage());

    const panel = screen.getByTestId("qkit-earn-settings");
    expect(panel).toHaveTextContent("current:p1");
    expect(panel).toHaveTextContent("pro:true");
  });
});
