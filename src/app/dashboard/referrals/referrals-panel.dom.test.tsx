// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { createReferralHostActionMock } = vi.hoisted(() => ({
  createReferralHostActionMock: vi.fn(),
}));

vi.mock("./actions", () => ({
  createReferralHostAction: createReferralHostActionMock,
}));

import { ReferralsPanel } from "./referrals-panel";
import type { ReferralHostSummary } from "./types";

const programs = [{ id: "p1", name: "Stamp Club" }];

const existingHost: ReferralHostSummary = {
  id: "rh1",
  programId: "p1",
  programName: "Stamp Club",
  hostPhone: "+6591234567",
  label: "Sarah & Wei's Wedding",
  referralCode: "abc123",
  guestCount: 3,
  link: "https://loopkit.test/c?v=v1&ref=abc123",
  qr: '<svg data-testid="host-qr"></svg>',
};

describe("ReferralsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty-state message when there are no referral hosts yet", () => {
    render(<ReferralsPanel programs={programs} initialHosts={[]} />);
    expect(screen.getByText(/no referral links yet/i)).toBeInTheDocument();
  });

  it("renders an existing host's label, guest count, and link", () => {
    render(
      <ReferralsPanel programs={programs} initialHosts={[existingHost]} />,
    );
    expect(screen.getByText("Sarah & Wei's Wedding")).toBeInTheDocument();
    expect(screen.getByText("Stamp Club · +6591234567")).toBeInTheDocument();
    expect(screen.getByText("3 guests")).toBeInTheDocument();
    expect(
      screen.getByText("https://loopkit.test/c?v=v1&ref=abc123"),
    ).toBeInTheDocument();
  });

  it("falls back to the program name when a host has no label", () => {
    render(
      <ReferralsPanel
        programs={programs}
        initialHosts={[{ ...existingHost, label: null }]}
      />,
    );
    expect(screen.getAllByText("Stamp Club").length).toBeGreaterThan(0);
  });

  it("shows a role=alert message when creation fails", async () => {
    createReferralHostActionMock.mockResolvedValue({
      status: "error",
      message: "Enter a valid Singapore phone number.",
    });
    const user = userEvent.setup();
    render(<ReferralsPanel programs={programs} initialHosts={[]} />);
    await user.type(screen.getByLabelText("Host's phone"), "123");
    await user.click(
      screen.getByRole("button", { name: /create referral link/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid Singapore phone number.",
    );
  });

  it("prepends a newly created host to the list without losing existing ones", async () => {
    const createdHost: ReferralHostSummary = {
      ...existingHost,
      id: "rh2",
      label: "New Host",
      guestCount: 0,
    };
    createReferralHostActionMock.mockResolvedValue({
      status: "created",
      host: createdHost,
    });
    const user = userEvent.setup();
    render(
      <ReferralsPanel programs={programs} initialHosts={[existingHost]} />,
    );
    await user.type(screen.getByLabelText("Host's phone"), "91234567");
    await user.click(
      screen.getByRole("button", { name: /create referral link/i }),
    );

    expect(await screen.findByText("New Host")).toBeInTheDocument();
    expect(screen.getByText("Sarah & Wei's Wedding")).toBeInTheDocument();
  });
});
