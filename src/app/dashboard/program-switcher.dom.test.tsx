// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgramSwitcher } from "./program-switcher";

const programs = [
  { id: "p1", name: "Coffee Stamps" },
  { id: "p2", name: "Bubble Tea Club" },
];

describe("ProgramSwitcher", () => {
  it("renders a select with every program and the current one chosen", () => {
    render(
      <ProgramSwitcher
        programs={programs}
        currentId="p2"
        action="/dashboard/stats"
      />,
    );
    const select = screen.getByLabelText("Switch program") as HTMLSelectElement;
    expect(select.value).toBe("p2");
    expect(
      screen.getByRole("option", { name: "Coffee Stamps" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Bubble Tea Club" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch" })).toBeInTheDocument();
  });

  it("submits as a GET form to the given action", () => {
    render(
      <ProgramSwitcher
        programs={programs}
        currentId="p1"
        action="/dashboard/activity"
      />,
    );
    const form = screen
      .getByRole("button", { name: "Switch" })
      .closest("form") as HTMLFormElement;
    expect(form.getAttribute("action")).toBe("/dashboard/activity");
    expect(form.method).toBe("get");
  });

  it("renders nothing when there is only one program", () => {
    render(
      <ProgramSwitcher
        programs={[programs[0]]}
        currentId="p1"
        action="/dashboard/stats"
      />,
    );
    expect(screen.queryByLabelText("Switch program")).not.toBeInTheDocument();
  });
});
