// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardNav } from "./dashboard-nav";
import type { ActionResult } from "@/lib/action-result";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/activity",
}));

const { submitFeedbackMock } = vi.hoisted(() => ({
  submitFeedbackMock: vi.fn(async (): Promise<ActionResult> => ({
    success: true,
  })),
}));
vi.mock("@/app/actions/feedback", () => ({
  submitFeedbackAction: submitFeedbackMock,
}));

const { submitSupportMock } = vi.hoisted(() => ({
  submitSupportMock: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/app/actions/support", () => ({
  submitSupportMessageAction: submitSupportMock,
}));

describe("DashboardNav", () => {
  const baseProps = {
    signOut: vi.fn(async () => {}),
    email: "vendor@example.com",
    vendorName: "Kopi Corner",
    avatarUrl: null,
    tier: "free" as const,
  };

  it("renders Customers, Activity, Stats, and Referrals as inline nav links", () => {
    render(<DashboardNav {...baseProps} />);
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute(
      "href",
      "/dashboard/customers",
    );
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      "/dashboard/activity",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "href",
      "/dashboard/stats",
    );
    expect(screen.getByRole("link", { name: "Referrals" })).toHaveAttribute(
      "href",
      "/dashboard/referrals",
    );
  });

  it("renders Dashboard as the first inline nav link", () => {
    render(<DashboardNav {...baseProps} />);
    const links = screen.getAllByRole("link");
    const navLabels = [
      "Dashboard",
      "Customers",
      "Activity",
      "Stats",
      "Referrals",
    ];
    const navLinks = links.filter((l) =>
      navLabels.includes(l.textContent ?? ""),
    );
    expect(navLinks.map((l) => l.textContent)).toEqual(navLabels);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  it("renders a mobile menu toggle", () => {
    render(<DashboardNav {...baseProps} />);
    expect(
      screen.getByRole("button", { name: /mobile navigation menu/i }),
    ).toBeInTheDocument();
  });

  it("carries data-tour anchors for the onboarding tour", () => {
    render(<DashboardNav {...baseProps} />);
    expect(
      screen.getByRole("button", { name: /mobile navigation menu/i }),
    ).toHaveAttribute("data-tour", "nav-menu");
    expect(
      screen.getByRole("button", { name: /account menu/i }),
    ).toHaveAttribute("data-tour", "nav-account");
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "data-tour",
      "nav-dashboard",
    );
    expect(screen.getByRole("link", { name: "Customers" })).toHaveAttribute(
      "data-tour",
      "nav-customers",
    );
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "data-tour",
      "nav-activity",
    );
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute(
      "data-tour",
      "nav-stats",
    );
    expect(screen.getByRole("link", { name: "Referrals" })).toHaveAttribute(
      "data-tour",
      "nav-referrals",
    );
  });

  it("account menu has Switch products, Profile, Settings, Plan, Get help, Feedback, then Sign out, in order", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.map((item) => item.textContent)).toEqual([
      "Switch products",
      "Profile",
      "Settings",
      "Plan · free",
      "Get help",
      "Feedback",
      "Sign out",
    ]);
  });

  it("shows the tier badge behind the opened account menu", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} tier="pro" />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    expect(screen.getByText("Pro")).toBeInTheDocument();
  });

  it("account menu shows the real stall name, not a static 'Vendor account' label", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    const menu = within(screen.getByRole("menu"));
    expect(menu.getByText("Kopi Corner")).toBeInTheDocument();
    expect(screen.queryByText("Vendor account")).not.toBeInTheDocument();
    expect(screen.queryByText("vendor@example.com")).not.toBeInTheDocument();
  });

  it("falls back to 'Your stall' (not the email) when no stall name is set", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} vendorName={null} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    const menu = within(screen.getByRole("menu"));
    expect(menu.getByText("Your stall")).toBeInTheDocument();
    expect(screen.queryByText("vendor@example.com")).not.toBeInTheDocument();
  });

  it("shows the stall name beside the avatar in the trigger itself, not just inside the opened menu", () => {
    render(<DashboardNav {...baseProps} />);
    const accountButton = screen.getByRole("button", {
      name: /account menu/i,
    });
    expect(within(accountButton).getByText("Kopi Corner")).toBeInTheDocument();
  });

  it("opening Feedback from the account menu and submitting calls submitFeedbackAction with the picked NPS score", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /feedback/i }));

    await user.click(screen.getByRole("radio", { name: "9" }));
    await user.type(screen.getByRole("textbox"), "Great app");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(submitFeedbackMock).toHaveBeenCalledWith({
      nps: 9,
      message: "Great app",
    });
  });

  it("a failed feedback submit surfaces an inline error, not a silent failure", async () => {
    submitFeedbackMock.mockResolvedValueOnce({
      success: false,
      error: "boom",
    });
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /feedback/i }));
    await user.click(screen.getByRole("radio", { name: "9" }));
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  it("account menu offers a Switch products submenu listing the other three live kits", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(await screen.findByText(/switch products/i));

    const qkit = await screen.findByRole("menuitem", { name: "qkit" });
    expect(qkit).toHaveAttribute("href", "https://qkit.merqo.io");
    const paykit = await screen.findByRole("menuitem", { name: "paykit" });
    expect(paykit).toHaveAttribute("href", "https://paykit.merqo.io");
    const stockkit = await screen.findByRole("menuitem", {
      name: "stockkit",
    });
    expect(stockkit).toHaveAttribute("href", "https://stockkit.merqo.io");
    expect(
      screen.queryByRole("menuitem", { name: "loopkit" }),
    ).not.toBeInTheDocument();
  });

  it("opening Get help and submitting maps the sheet's message to submitSupportMessageAction's body field", async () => {
    const user = userEvent.setup();
    render(<DashboardNav {...baseProps} />);
    await user.click(screen.getByRole("button", { name: /account menu/i }));
    await user.click(screen.getByRole("menuitem", { name: /get help/i }));

    const textbox = screen.getByRole("textbox");
    await user.type(textbox, "Something broke");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(submitSupportMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Something broke" }),
    );
  });
});
