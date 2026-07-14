// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProgramSwitcher } from "./program-switcher";

const { routerPush, searchParamsValue } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  searchParamsValue: { current: "" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () => new URLSearchParams(searchParamsValue.current),
}));

const programs = [
  { id: "p1", name: "Coffee Stamps" },
  { id: "p2", name: "Bubble Tea Club" },
];

describe("ProgramSwitcher", () => {
  it("renders All programs plus every program, with the current one selected", async () => {
    searchParamsValue.current = "p=p2";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId="p2"
        basePath="/dashboard/stats"
      />,
    );
    const trigger = screen.getByLabelText("Switch program");
    expect(trigger).toHaveTextContent("Bubble Tea Club");

    await userEvent.click(trigger);
    expect(screen.getByText("All programs")).toBeInTheDocument();
    expect(screen.getAllByText("Coffee Stamps").length).toBeGreaterThan(0);
  });

  it("selects All programs when currentId is empty", () => {
    searchParamsValue.current = "";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId=""
        basePath="/dashboard/stats"
      />,
    );
    expect(screen.getByLabelText("Switch program")).toHaveTextContent(
      "All programs",
    );
  });

  it("pushes the base path with p set, preserving other params, on selecting a program", async () => {
    searchParamsValue.current = "q=alice";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId=""
        basePath="/dashboard/customers"
      />,
    );
    await userEvent.click(screen.getByLabelText("Switch program"));
    await userEvent.click(screen.getByText("Coffee Stamps"));
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/customers?q=alice&p=p1",
    );
  });

  it("pushes the base path with p removed when All programs is chosen", async () => {
    searchParamsValue.current = "p=p1&q=alice";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId="p1"
        basePath="/dashboard/customers"
      />,
    );
    await userEvent.click(screen.getByLabelText("Switch program"));
    await userEvent.click(screen.getByText("All programs"));
    expect(routerPush).toHaveBeenCalledWith("/dashboard/customers?q=alice");
  });

  it("renders nothing when there is only one program", () => {
    render(
      <ProgramSwitcher
        programs={[programs[0]]}
        currentId="p1"
        basePath="/dashboard/stats"
      />,
    );
    expect(screen.queryByLabelText("Switch program")).not.toBeInTheDocument();
  });
});
