// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ServedStrip, type ServedEntry } from "./served-strip";

const entries: ServedEntry[] = [
  {
    id: "1",
    phone: "+6591234567",
    note: "6 to 7 of 8",
    undoable: true,
  },
  {
    id: "2",
    phone: "+6598887777",
    note: "reward redeemed, free kopi-o",
    undoable: false,
  },
];

describe("ServedStrip", () => {
  it("renders one Undo button, for the undoable entry only", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<ServedStrip entries={entries} onUndo={onUndo} />);

    const undoButtons = screen.getAllByRole("button", { name: "Undo" });
    expect(undoButtons).toHaveLength(1);

    await user.click(undoButtons[0]);
    expect(onUndo).toHaveBeenCalledWith(entries[0]);
  });

  it("shows the note and a masked phone", () => {
    render(<ServedStrip entries={entries} onUndo={vi.fn()} />);
    expect(screen.getByText("••••4567")).toBeInTheDocument();
    expect(screen.getByText(/6 to 7 of 8/)).toBeInTheDocument();
  });

  it("renders nothing when there are no entries", () => {
    const { container } = render(<ServedStrip entries={[]} onUndo={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
