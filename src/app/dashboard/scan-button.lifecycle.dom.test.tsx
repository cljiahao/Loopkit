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
  decode: vi.fn(),
  resolve: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromVideoDevice(...args: unknown[]) {
      return mocks.decode(...args);
    }
  },
}));
vi.mock("@/app/dashboard/actions", () => ({
  resolveTokenAction: mocks.resolve,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toast } }));
import { ScanButton } from "./scan-button";
type Callback = (
  result: { getText: () => string } | null,
  error: unknown,
  controls: { stop: () => void },
) => Promise<void>;
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());
describe("scanner lifecycle", () => {
  it("releases a camera whose acquisition finishes after unmount", async () => {
    let finish!: (controls: { stop: () => void }) => void;
    const stop = vi.fn();
    mocks.decode.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<ScanButton onResolved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan to serve" }));
    await waitFor(() => expect(mocks.decode).toHaveBeenCalled());
    view.unmount();
    await act(async () => finish({ stop }));
    expect(stop).toHaveBeenCalledOnce();
  });
  it("handles callbacks before the acquisition promise resolves", async () => {
    let callback!: Callback;
    let finish!: (controls: { stop: () => void }) => void;
    const stop = vi.fn(),
      resolved = vi.fn();
    mocks.decode.mockImplementation(
      (_device: unknown, _video: unknown, cb: Callback) => {
        callback = cb;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    );
    mocks.resolve.mockResolvedValue({
      success: true,
      kind: "card",
      phone: "+6591234567",
      programId: "p",
    });
    render(<ScanButton onResolved={resolved} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan to serve" }));
    await waitFor(() => expect(mocks.decode).toHaveBeenCalled());
    await act(async () => callback({ getText: () => "token" }, null, { stop }));
    await act(async () => finish({ stop }));
    expect(resolved).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalled();
  });
  it("delivers the resolved voucher and submits the decoded token once", async () => {
    let callback!: Callback;
    const stop = vi.fn();
    const resolved = vi.fn();
    const voucher = {
      success: true as const,
      kind: "voucher" as const,
      phone: "+6591234567",
      voucherToken: "voucher-token",
      rewardText: "Free drink",
    };
    mocks.decode.mockImplementation(
      (_device: unknown, _video: unknown, cb: Callback) => {
        callback = cb;
        return Promise.resolve({ stop });
      },
    );
    mocks.resolve.mockResolvedValue(voucher);
    render(<ScanButton onResolved={resolved} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan to serve" }));
    await waitFor(() => expect(mocks.decode).toHaveBeenCalled());
    await act(async () => {
      await callback({ getText: () => "voucher-token" }, null, { stop });
      await callback({ getText: () => "voucher-token" }, null, { stop });
    });
    expect(mocks.resolve).toHaveBeenCalledOnce();
    expect(mocks.resolve.mock.calls[0][0].get("token")).toBe("voucher-token");
    expect(resolved).toHaveBeenCalledExactlyOnceWith(voucher);
    expect(stop).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
  it("closes the scanner and shows rejected token lookup errors", async () => {
    let callback!: Callback;
    const stop = vi.fn();
    mocks.decode.mockImplementation(
      (_device: unknown, _video: unknown, cb: Callback) => {
        callback = cb;
        return Promise.resolve({ stop });
      },
    );
    mocks.resolve.mockRejectedValue(new Error("offline"));
    render(<ScanButton onResolved={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Scan to serve" }));
    await waitFor(() => expect(mocks.decode).toHaveBeenCalled());
    await act(async () => callback({ getText: () => "token" }, null, { stop }));
    expect(mocks.toast).toHaveBeenCalledWith(
      "Couldn't read that code. Try again.",
    );
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
