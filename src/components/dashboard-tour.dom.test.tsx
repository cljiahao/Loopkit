// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { DashboardTour } from "./dashboard-tour";

// The tour mechanism itself (driver.js lifecycle, auto-run/replay timing,
// mark-seen-once semantics, popover styling) is owned and tested by
// @merqo/ui's own DashboardTour. This file's job is narrower: confirm
// loopkit wires the right props through to it.
const mocks = vi.hoisted(() => {
  const state = { pathname: "/dashboard", lastProps: null as unknown };
  return {
    state,
    push: vi.fn(),
    SharedDashboardTour: vi.fn((props: unknown) => {
      state.lastProps = props;
      return null;
    }),
  };
});

vi.mock("@merqo/ui", () => ({ DashboardTour: mocks.SharedDashboardTour }));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.state.pathname,
  useRouter: () => ({ push: mocks.push }),
}));

type DashboardTourProps = {
  steps: unknown;
  seen: boolean;
  onFirstSeen: () => Promise<void>;
  isHomeRoute: boolean;
  navigateHome: () => void;
  scopeClassName: string;
};
const props = () => mocks.state.lastProps as DashboardTourProps;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.pathname = "/dashboard";
  mocks.state.lastProps = null;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DashboardTour", () => {
  it("passes a lazy steps resolver that resolves mobile-vs-desktop via matchMedia at start time", () => {
    render(<DashboardTour seen={false} />);
    expect(typeof props().steps).toBe("function");

    // Not a bare array: the resolver must be called to get steps, and it
    // must consult matchMedia at that point, not at render time.
    const resolver = props().steps as () => { element: string }[];
    expect(resolver()).toHaveLength(6); // desktop list (jsdom matchMedia absent)

    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    try {
      expect(resolver()).toHaveLength(3); // mobile list
    } finally {
      window.matchMedia = original;
    }
  });

  it("passes seen through unchanged", () => {
    render(<DashboardTour seen={true} />);
    expect(props().seen).toBe(true);

    render(<DashboardTour seen={false} />);
    expect(props().seen).toBe(false);
  });

  it("navigateHome pushes to /dashboard", () => {
    render(<DashboardTour seen={true} />);
    props().navigateHome();
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("isHomeRoute is true only on the exact /dashboard route", () => {
    mocks.state.pathname = "/dashboard/customers";
    render(<DashboardTour seen={true} />);
    expect(props().isHomeRoute).toBe(false);
  });

  it("isHomeRoute is true on /dashboard", () => {
    render(<DashboardTour seen={true} />);
    expect(props().isHomeRoute).toBe(true);
  });

  it("onFirstSeen posts to /api/tour-seen with keepalive, so the write survives a hard nav mid-flight", async () => {
    render(<DashboardTour seen={true} />);
    await props().onFirstSeen();
    expect(fetch).toHaveBeenCalledWith("/api/tour-seen", {
      method: "POST",
      keepalive: true,
    });
  });

  it("onFirstSeen never throws even if the fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<DashboardTour seen={true} />);
    await expect(props().onFirstSeen()).resolves.toBeUndefined();
  });

  it("scopeClassName is loopkit-tour", () => {
    render(<DashboardTour seen={true} />);
    expect(props().scopeClassName).toBe("loopkit-tour");
  });
});
