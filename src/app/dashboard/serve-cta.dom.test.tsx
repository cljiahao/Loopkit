// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ServeCta } from "./serve-cta";

const KEY = "loopkit:last-counter-program";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("ServeCta", () => {
  it("targets the stored program when it is one the vendor owns", () => {
    window.localStorage.setItem(KEY, "p2");
    render(<ServeCta defaultProgramId="p1" programIds={["p1", "p2"]} />);
    expect(
      screen.getByRole("link", { name: /serve a customer/i }),
    ).toHaveAttribute("href", "/dashboard/counter?p=p2");
  });

  it("falls back to the default when the stored id is not owned", () => {
    window.localStorage.setItem(KEY, "gone");
    render(<ServeCta defaultProgramId="p1" programIds={["p1", "p2"]} />);
    expect(
      screen.getByRole("link", { name: /serve a customer/i }),
    ).toHaveAttribute("href", "/dashboard/counter?p=p1");
  });

  it("falls back without crashing when localStorage throws", () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(
      () => {
        throw new Error("blocked");
      },
    );
    render(<ServeCta defaultProgramId="p1" programIds={["p1"]} />);
    expect(
      screen.getByRole("link", { name: /serve a customer/i }),
    ).toHaveAttribute("href", "/dashboard/counter?p=p1");
  });
});
