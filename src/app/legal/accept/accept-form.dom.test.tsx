// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@merqo/ui", () => ({
  TermsAcceptanceCheckbox: (props: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }) => (
    <input
      type="checkbox"
      aria-label="I accept the terms"
      checked={props.checked}
      onChange={(e) => props.onCheckedChange(e.target.checked)}
    />
  ),
}));
vi.mock("./actions", () => ({ acceptLegalTerms: vi.fn() }));

import { AcceptForm } from "./accept-form";

describe("AcceptForm", () => {
  it("carries the next path through a hidden field", () => {
    render(<AcceptForm next="/dashboard/settings" />);
    expect(
      screen.getByDisplayValue("/dashboard/settings", { exact: true }),
    ).toBeInTheDocument();
  });

  it("disables Continue until the checkbox is checked", () => {
    render(<AcceptForm next="/dashboard" />);
    const submit = screen.getByRole("button", { name: /continue/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByLabelText("I accept the terms"));
    expect(submit).toBeEnabled();
  });
});
