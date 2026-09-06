// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@merqo/ui", () => ({
  TermsAcceptanceCheckbox: (props: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    legalName: string;
    onLegalNameChange: (value: string) => void;
  }) => (
    <div>
      <input
        type="checkbox"
        aria-label="I accept the terms"
        checked={props.checked}
        onChange={(e) => props.onCheckedChange(e.target.checked)}
      />
      <input
        type="text"
        aria-label="Legal name"
        value={props.legalName}
        onChange={(e) => props.onLegalNameChange(e.target.value)}
      />
    </div>
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

  it("disables Continue until both the checkbox and legal name are filled", () => {
    render(<AcceptForm next="/dashboard" />);
    const submit = screen.getByRole("button", { name: /continue/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByLabelText("I accept the terms"));
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Legal name"), {
      target: { value: "Jane Vendor" },
    });
    expect(submit).toBeEnabled();
  });

  it("keeps Continue disabled when the legal name is only whitespace", () => {
    render(<AcceptForm next="/dashboard" />);
    fireEvent.click(screen.getByLabelText("I accept the terms"));
    fireEvent.change(screen.getByLabelText("Legal name"), {
      target: { value: "   " },
    });

    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });
});
