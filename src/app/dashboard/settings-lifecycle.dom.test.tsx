// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  earn: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock("./actions", () => ({
  saveCustomerNotifySettingsAction: mocks.notify,
  saveQkitEarnConfigAction: mocks.earn,
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success },
}));
import { CustomerNotifySettings } from "./customer-notify-settings";
import { QkitEarnSettings } from "./qkit-earn-settings";
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
describe.each(["notify", "earn"] as const)(
  "%s settings request lifecycle",
  (kind) => {
    function mount() {
      return kind === "notify"
        ? render(<CustomerNotifySettings current={null} />)
        : render(
            <QkitEarnSettings
              programs={[{ id: "p1", name: "Coffee" }]}
              current={{ programId: "p1", enabled: true }}
              isPro
            />,
          );
    }
    it("keeps Save disabled until the action settles", async () => {
      let settle!: (value: { success: true; enabled: true }) => void;
      mocks[kind].mockImplementation(
        () =>
          new Promise((resolve) => {
            settle = resolve;
          }),
      );
      mount();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled(),
      );
      await act(async () => settle({ success: true, enabled: true }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
      );
      expect(mocks.success).toHaveBeenCalledWith("Settings saved");
    });
    it("surfaces rejection and restores Save", async () => {
      mocks[kind].mockRejectedValue(Error("offline"));
      mount();
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(mocks.error).toHaveBeenCalledWith(
          "Could not save settings. Try again.",
        ),
      );
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });
  },
);
