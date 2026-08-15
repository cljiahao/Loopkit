// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { setProgramActiveMock, removeCardMock } = vi.hoisted(() => ({
  setProgramActiveMock: vi.fn(),
  removeCardMock: vi.fn(),
}));
vi.mock("@/app/admin/actions", () => ({
  setProgramActive: setProgramActiveMock,
  removeCard: removeCardMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { Manage } from "./manage";

describe("Manage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a Deactivate confirm dialog naming the active program", async () => {
    const user = userEvent.setup();
    render(
      <Manage
        program={{ id: "p1", name: "Coffee Stamps", active: true }}
        cards={[]}
        stampsRequired={8}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Deactivate program" }),
    );
    expect(
      screen.getByRole("heading", { name: "Deactivate Coffee Stamps?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Deactivate" }),
    ).toBeInTheDocument();
  });

  it("shows a Reactivate confirm dialog for an inactive program", async () => {
    const user = userEvent.setup();
    render(
      <Manage
        program={{ id: "p1", name: "Coffee Stamps", active: false }}
        cards={[]}
        stampsRequired={8}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "Reactivate program" }),
    );
    expect(
      screen.getByRole("heading", { name: "Reactivate Coffee Stamps?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reactivate" }),
    ).toBeInTheDocument();
  });

  it("renders a card row and removes it via the confirm dialog", async () => {
    const user = userEvent.setup();
    removeCardMock.mockResolvedValue({ success: true });
    render(
      <Manage
        program={{ id: "p1", name: "Coffee Stamps", active: true }}
        cards={[
          { id: "c1", phone: "+6591234567", stamp_count: 3, reward_count: 1 },
        ]}
        stampsRequired={8}
      />,
    );
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText(/3\/8 stamps · 1 reward/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove card" }));
    expect(
      screen.getByRole("heading", { name: "Remove this card?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeCardMock).toHaveBeenCalled();
  });
});
