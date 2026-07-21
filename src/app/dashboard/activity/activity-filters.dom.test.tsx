// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFilters } from "./activity-filters";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const programs = [
  { id: "p1", name: "Coffee Stamps" },
  { id: "p2", name: "Bubble Tea Club" },
];

describe("ActivityFilters", () => {
  it("renders the type/from/to fields and an Apply filters button", () => {
    render(
      <ActivityFilters
        basePath="/dashboard/activity"
        programs={programs}
        currentId=""
        currentP={undefined}
        type={undefined}
        from={undefined}
        to={undefined}
      />,
    );
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply filters" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Clear filters")).not.toBeInTheDocument();
  });

  it("shows a Clear filters link and preserves the program id when a filter is active", () => {
    render(
      <ActivityFilters
        basePath="/dashboard/activity"
        programs={programs}
        currentId="p1"
        currentP="p1"
        type="stamps"
        from="2026-07-01"
        to="2026-07-10"
      />,
    );
    const clear = screen.getByText("Clear filters");
    expect(clear).toHaveAttribute("href", "/dashboard/activity?p=p1");
    expect(screen.getByLabelText("From")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-07-10");
  });

  it("renders the Program field as one of this card's fields when there's more than one program", () => {
    render(
      <ActivityFilters
        basePath="/dashboard/activity"
        programs={programs}
        currentId=""
        currentP={undefined}
        type={undefined}
        from={undefined}
        to={undefined}
      />,
    );
    expect(screen.getByText("Program")).toBeInTheDocument();
    expect(screen.getByLabelText("Switch program")).toBeInTheDocument();
  });

  it("omits the Program field entirely for a single-program vendor", () => {
    render(
      <ActivityFilters
        basePath="/dashboard/activity"
        programs={[programs[0]]}
        currentId="p1"
        currentP="p1"
        type={undefined}
        from={undefined}
        to={undefined}
      />,
    );
    expect(screen.queryByText("Program")).not.toBeInTheDocument();
  });
});
