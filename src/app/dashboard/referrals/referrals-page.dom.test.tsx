// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1" } })),
}));

const programs = [
  { id: "p1", name: "Coffee Stamps", active: true },
  { id: "p2", name: "Retired Club", active: false },
];
vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => programs),
}));

const listReferralHostsMock = vi.fn();
vi.mock("@/lib/referrals", () => ({
  listReferralHosts: (...args: unknown[]) => listReferralHostsMock(...args),
  referralLink: (origin: string, vendorId: string, code: string) =>
    `${origin}/c?v=${vendorId}&ref=${code}`,
}));

vi.mock("@/lib/qr", () => ({ qrSvg: vi.fn(async () => "<svg></svg>") }));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === "host" ? "loopkit.test" : null),
  })),
}));

vi.mock("./referrals-panel", () => ({
  ReferralsPanel: (props: {
    programs: { id: string; name: string }[];
    initialHosts: { id: string; link: string; programName: string }[];
  }) => (
    <div data-testid="referrals-panel">
      programs:{props.programs.map((p) => p.name).join(",")} / hosts:
      {props.initialHosts.map((h) => `${h.programName}:${h.link}`).join(",")}
    </div>
  ),
}));

import ReferralsPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  listReferralHostsMock.mockResolvedValue([]);
  delete process.env.NEXT_PUBLIC_BASE_URL;
});

describe("ReferralsPage", () => {
  it("renders the heading and only offers active programs to the create form", async () => {
    render(await ReferralsPage());

    expect(
      screen.getByRole("heading", { name: "Referrals" }),
    ).toBeInTheDocument();
    const panel = screen.getByTestId("referrals-panel");
    expect(panel).toHaveTextContent("programs:Coffee Stamps");
    expect(panel).not.toHaveTextContent("Retired Club");
  });

  it("builds each existing host's shareable link from the request origin", async () => {
    listReferralHostsMock.mockResolvedValue([
      {
        id: "rh1",
        programId: "p1",
        hostPhone: "+6591234567",
        label: null,
        referralCode: "abc123",
        guestCount: 2,
        createdAt: "2026-08-20T00:00:00Z",
      },
    ]);

    render(await ReferralsPage());

    const panel = screen.getByTestId("referrals-panel");
    expect(panel).toHaveTextContent(
      "Coffee Stamps:https://loopkit.test/c?v=v1&ref=abc123",
    );
  });

  it("shows a setup prompt instead of the form when there are no active programs", async () => {
    vi.mocked((await import("@/lib/program")).listPrograms).mockResolvedValue([
      {
        id: "p2",
        name: "Retired Club",
        active: false,
        stamps_required: 10,
        reward_text: "Free coffee",
        type: "stamp",
        config: {},
        head_start: false,
        head_start_percent: 20,
        replaced_by: null,
        carry_over_stamps: false,
      },
    ]);

    render(await ReferralsPage());

    expect(
      screen.getByText(/set up an active program first/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("referrals-panel")).not.toBeInTheDocument();
  });
});
