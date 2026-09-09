// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditImpactDialog } from "@/app/setup/edit-impact-dialog";

function renderInForm(
  ui: React.ReactNode,
  onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault()),
) {
  return {
    onSubmit,
    ...render(<form onSubmit={onSubmit}>{ui}</form>),
  };
}

describe("EditImpactDialog", () => {
  it("renders a plain submit button when impactLines is null", () => {
    renderInForm(
      <EditImpactDialog
        impactLines={null}
        pending={false}
        label="Save changes"
      />,
    );
    const btn = screen.getByRole("button", { name: "Save changes" });
    expect(btn).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("renders a plain submit button when impactLines is empty", () => {
    renderInForm(
      <EditImpactDialog
        impactLines={[]}
        pending={false}
        label="Save changes"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toHaveAttribute("type", "submit");
  });

  it("opens a dialog listing every line and does not submit until confirmed", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderInForm(
      <EditImpactDialog
        impactLines={[
          "3 customers have a card on this program.",
          "The goal moves from 8 to 10.",
        ]}
        pending={false}
        label="Save changes"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toHaveAttribute("type", "button");

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "3 customers have a card on this program.",
    );
    expect(dialog).toHaveTextContent("The goal moves from 8 to 10.");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(screen.getByRole("button", { name: "Save the change" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
