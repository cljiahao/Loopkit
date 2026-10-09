// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSaveSettings } from "./use-save-settings";
const { success, error } = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success, error } }));
beforeEach(() => vi.clearAllMocks());
describe("settings save lifecycle", () => {
  it("serializes submissions and releases pending state after success", async () => {
    let finish: ((value: { success: true }) => void) | undefined;
    const action = vi.fn(
      () =>
        new Promise<{ success: true }>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = renderHook(() => useSaveSettings(action));
    const data = new FormData();
    data.set("enabled", "true");
    act(() => {
      result.current.save(data);
      result.current.save(data);
    });
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(data);
    expect(result.current.pending).toBe(true);
    await act(async () => {
      finish?.({ success: true });
    });
    expect(result.current.pending).toBe(false);
    expect(success).toHaveBeenCalledWith("Settings saved");
  });
  it("reports returned validation errors", async () => {
    const action = vi
      .fn()
      .mockResolvedValue({ success: false, error: "Invalid program" });
    const { result } = renderHook(() => useSaveSettings(action));
    await act(async () => result.current.save(new FormData()));
    expect(error).toHaveBeenCalledWith("Invalid program");
    expect(success).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });
  it("releases pending state and reports rejected saves", async () => {
    const action = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useSaveSettings(action));
    await act(async () => result.current.save(new FormData()));
    expect(error).toHaveBeenCalledWith("Could not save settings. Try again.");
    expect(result.current.pending).toBe(false);
  });
});
