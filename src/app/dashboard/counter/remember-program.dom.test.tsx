// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { RememberProgram } from "./remember-program";

const KEY = "loopkit:last-counter-program";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("RememberProgram", () => {
  it("writes the program id on mount and renders nothing", () => {
    const { container } = render(<RememberProgram id="p7" />);
    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem(KEY)).toBe("p7");
  });

  it("updates the stored value when the id changes", () => {
    const { rerender } = render(<RememberProgram id="p7" />);
    expect(localStorage.getItem(KEY)).toBe("p7");
    rerender(<RememberProgram id="p9" />);
    expect(localStorage.getItem(KEY)).toBe("p9");
  });

  it("does not crash when setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => render(<RememberProgram id="p1" />)).not.toThrow();
  });
});
