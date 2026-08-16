// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CustomerNotifySettings } from "./customer-notify-settings";

vi.mock("./actions", () => ({
  saveCustomerNotifySettingsAction: vi.fn().mockResolvedValue({
    success: true,
    enabled: true,
  }),
}));

describe("CustomerNotifySettings", () => {
  it("defaults checked when no vendor_notify_settings row exists yet", () => {
    render(<CustomerNotifySettings current={null} />);
    expect(screen.getByRole("switch", { name: /redemption/i })).toBeChecked();
  });

  it("defaults checked when the saved row has the flag true", () => {
    render(<CustomerNotifySettings current={{ enabled: true }} />);
    expect(screen.getByRole("switch", { name: /redemption/i })).toBeChecked();
  });

  it("defaults unchecked when the saved row has the flag false", () => {
    render(<CustomerNotifySettings current={{ enabled: false }} />);
    expect(
      screen.getByRole("switch", { name: /redemption/i }),
    ).not.toBeChecked();
  });

  it("lets a vendor flip the switch off before saving", () => {
    render(<CustomerNotifySettings current={{ enabled: true }} />);
    const toggle = screen.getByRole("switch", { name: /redemption/i });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);

    expect(toggle).not.toBeChecked();
  });
});
