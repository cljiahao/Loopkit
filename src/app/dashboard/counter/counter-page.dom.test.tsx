// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

const program = (id: string, name: string) => ({
  id,
  name,
  type: "stamp",
  stamps_required: 8,
  reward_text: "a free coffee",
  config: {},
  active: true,
  expiry_days: null,
  head_start: false,
  replaced_by: null,
  carry_over_stamps: false,
});

vi.mock("@/features/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1" } })),
}));
const { isProMock } = vi.hoisted(() => ({
  isProMock: vi.fn(async () => false),
}));
vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => [
    program("p1", "Coffee Stamps"),
    program("p2", "Bakery Stamps"),
  ]),
  currentProgram: (programs: { id: string }[], id?: string) =>
    programs.find((p) => p.id === id) ?? null,
  isPro: isProMock,
  getEntitlement: (pro: boolean) => ({ showBranding: !pro }),
}));
vi.mock("@/lib/cards", () => ({
  activeCardCountsByProgram: vi.fn(async () => ({ p1: 3, p2: 9 })),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map([["host", "loopkit.test"]])),
}));
vi.mock("@/lib/vendor", () => ({
  getVendorProfile: vi.fn(async () => ({ name: "Kopi Corner" })),
}));
vi.mock("@/lib/qr", () => ({
  qrSvg: vi.fn(async () => "<svg id='qr'></svg>"),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/app/dashboard/program-switcher", () => ({
  ProgramSwitcher: () => <div data-testid="program-switcher" />,
}));
vi.mock("@/app/dashboard/counter/remember-program", () => ({
  RememberProgram: ({ id }: { id: string }) => (
    <div data-testid="remember-program" data-id={id} />
  ),
}));
vi.mock("@/app/dashboard/serve-customer", () => ({
  ServeCustomer: (props: Record<string, unknown>) => (
    <div
      data-testid="serve-customer"
      data-program={String(props.programId)}
      data-qr={String(props.shopJoinQrSvg)}
      data-link={String(props.shopJoinLink)}
      data-shop={String(props.shopName)}
      data-phone={String(props.initialPhone)}
      data-branding={String(props.showBranding)}
    />
  ),
}));

import CounterPage from "./page";

describe("CounterPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes the resolved program and shop-join props to ServeCustomer", async () => {
    render(
      await CounterPage({
        searchParams: Promise.resolve({ p: "p1", phone: "+6591234567" }),
      }),
    );
    expect(
      screen.getByRole("link", { name: /back to dashboard/i }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    const serve = screen.getByTestId("serve-customer");
    expect(serve).toHaveAttribute("data-program", "p1");
    expect(serve).toHaveAttribute("data-qr", "<svg id='qr'></svg>");
    expect(serve).toHaveAttribute("data-link", "https://loopkit.test/c?v=v1");
    expect(serve).toHaveAttribute("data-shop", "Kopi Corner");
    expect(serve).toHaveAttribute("data-phone", "+6591234567");
    expect(serve).toHaveAttribute("data-branding", "true");
    expect(screen.getByTestId("remember-program")).toHaveAttribute(
      "data-id",
      "p1",
    );
  });

  it("hides shop-join branding for a Pro vendor", async () => {
    isProMock.mockResolvedValue(true);
    render(
      await CounterPage({
        searchParams: Promise.resolve({ p: "p1" }),
      }),
    );
    expect(screen.getByTestId("serve-customer")).toHaveAttribute(
      "data-branding",
      "false",
    );
  });

  it("redirects to the busiest program when ?p= is missing", async () => {
    await expect(
      CounterPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/dashboard/counter?p=p2");
    expect(redirect).toHaveBeenCalledWith("/dashboard/counter?p=p2");
  });

  it("redirects to /dashboard when ?p= doesn't match any program", async () => {
    await expect(
      CounterPage({ searchParams: Promise.resolve({ p: "nope" }) }),
    ).rejects.toThrow("REDIRECT:/dashboard");
  });
});
