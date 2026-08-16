// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { disconnectTelegramActionMock, refreshMock } = vi.hoisted(() => ({
  disconnectTelegramActionMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock("@/app/dashboard/actions", () => ({
  disconnectTelegramAction: disconnectTelegramActionMock,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { ConnectTelegramSection } from "./connect-telegram-section";

describe("ConnectTelegramSection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the deep-link QR and tappable link when disconnected and configured", () => {
    render(
      <ConnectTelegramSection
        connected={false}
        configured={true}
        qrSvgMarkup="<svg data-testid='qr' />"
        deepLink="https://t.me/LoopkitAlertsBot?start=abc123"
      />,
    );

    expect(screen.getByTestId("qr")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /t\.me\/LoopkitAlertsBot/ }),
    ).toHaveAttribute("href", "https://t.me/LoopkitAlertsBot?start=abc123");
  });

  it("shows a not-configured message and no QR when the bot isn't set up", () => {
    render(<ConnectTelegramSection connected={false} configured={false} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/not set up yet/i)).toBeInTheDocument();
  });

  it("shows a Connected state with a disconnect action", async () => {
    disconnectTelegramActionMock.mockResolvedValue({ success: true });
    render(<ConnectTelegramSection connected={true} />);

    expect(screen.getByText(/connected/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));

    await waitFor(() => {
      expect(disconnectTelegramActionMock).toHaveBeenCalled();
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("surfaces an error toast without refreshing when disconnect fails", async () => {
    disconnectTelegramActionMock.mockResolvedValue({
      success: false,
      error: "Something went wrong.",
    });
    render(<ConnectTelegramSection connected={true} />);

    fireEvent.click(screen.getByRole("button", { name: /disconnect/i }));

    await waitFor(() => {
      expect(disconnectTelegramActionMock).toHaveBeenCalled();
    });
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
