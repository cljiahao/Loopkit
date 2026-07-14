// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QkitEarnSettings } from "./qkit-earn-settings";

vi.mock("./actions", () => ({
  saveQkitEarnConfigAction: vi.fn().mockResolvedValue({ success: true }),
}));

describe("QkitEarnSettings", () => {
  it("shows an upgrade prompt instead of the form when not Pro", () => {
    render(
      <QkitEarnSettings
        programs={[{ id: "p1", name: "Coffee Stamps" }]}
        current={null}
        isPro={false}
      />,
    );
    expect(screen.getByText(/upgrade to pro/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("lets a Pro vendor pick a program and enable it", () => {
    render(
      <QkitEarnSettings
        programs={[{ id: "p1", name: "Coffee Stamps" }]}
        current={null}
        isPro={true}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("switch", { name: /earn from qkit orders/i }),
    );
    expect(
      screen.getByRole("switch", { name: /earn from qkit orders/i }),
    ).toBeChecked();
  });
});
