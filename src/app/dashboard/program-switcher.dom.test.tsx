// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  it("renders All programs plus every program, with the current one selected", () => {
    searchParamsValue.current = "p=p2";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId="p2"
        basePath="/dashboard/stats"
      />,
    );
    const select = screen.getByLabelText("Switch program") as HTMLSelectElement;
    expect(select.value).toBe("p2");
    expect(
      screen.getByRole("option", { name: "All programs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Coffee Stamps" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Bubble Tea Club" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Switch" }),
    ).not.toBeInTheDocument();
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
    const select = screen.getByLabelText("Switch program") as HTMLSelectElement;
    expect(select.value).toBe("");
  });

  it("pushes the base path with p set, preserving other params, on change", () => {
    searchParamsValue.current = "q=alice";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId=""
        basePath="/dashboard/customers"
      />,
    );
    fireEvent.change(screen.getByLabelText("Switch program"), {
      target: { value: "p1" },
    });
    expect(routerPush).toHaveBeenCalledWith(
      "/dashboard/customers?q=alice&p=p1",
    );
  });

  it("pushes the base path with p removed when All programs is chosen", () => {
    searchParamsValue.current = "p=p1&q=alice";
    render(
      <ProgramSwitcher
        programs={programs}
        currentId="p1"
        basePath="/dashboard/customers"
      />,
    );
    fireEvent.change(screen.getByLabelText("Switch program"), {
      target: { value: "" },
    });
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
