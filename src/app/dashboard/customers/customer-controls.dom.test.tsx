// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerControls } from "./customer-controls";

const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

describe("CustomerControls", () => {
  it("renders the three sort options", async () => {
    render(<CustomerControls sort="recent" preservedParams={{}} />);
    await userEvent.click(screen.getByLabelText("Sort"));
    expect(screen.getAllByText("Last visit").length).toBeGreaterThan(0);
    expect(screen.getByText("Longest away")).toBeInTheDocument();
    expect(screen.getByText("Closest to reward")).toBeInTheDocument();
  });

  it("pushes sort=progress and keeps the preserved q and seg params", async () => {
    render(
      <CustomerControls
        sort="recent"
        preservedParams={{ q: "alice", seg: "ready" }}
      />,
    );
    await userEvent.click(screen.getByLabelText("Sort"));
    await userEvent.click(screen.getByText("Closest to reward"));
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/customers?q=alice&seg=ready&sort=progress",
    );
  });

  it("omits empty preserved params", async () => {
    render(
      <CustomerControls
        sort="recent"
        preservedParams={{ q: undefined, seg: "all" }}
      />,
    );
    await userEvent.click(screen.getByLabelText("Sort"));
    await userEvent.click(screen.getByText("Longest away"));
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/customers?seg=all&sort=away",
    );
  });
});
