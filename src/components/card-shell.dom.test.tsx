// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CardShell } from "@/components/card-shell";

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("CardShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children and a holographic sheen layer by default", () => {
    mockMatchMedia(false);
    render(
      <CardShell>
        <p>Card content</p>
      </CardShell>,
    );
    expect(screen.getByText("Card content")).toBeInTheDocument();
    expect(screen.getByTestId("card-shell-sheen")).toBeInTheDocument();
  });

  it("tilts toward the pointer position on pointer move", () => {
    mockMatchMedia(false);
    render(
      <CardShell>
        <p>Card content</p>
      </CardShell>,
    );
    const shell = screen.getByTestId("card-shell");
    vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => "",
    });
    fireEvent.pointerMove(shell, { clientX: 200, clientY: 100 });
    expect(shell.style.transform).toContain("rotateX");
    expect(shell.style.transform).not.toBe(
      "perspective(800px) rotateX(0deg) rotateY(0deg)",
    );
  });

  it("resets tilt to flat on pointer leave", () => {
    mockMatchMedia(false);
    render(
      <CardShell>
        <p>Card content</p>
      </CardShell>,
    );
    const shell = screen.getByTestId("card-shell");
    fireEvent.pointerLeave(shell);
    expect(shell.style.transform).toBe(
      "perspective(800px) rotateX(0deg) rotateY(0deg)",
    );
  });

  it("skips the sheen and tilt entirely under prefers-reduced-motion", () => {
    mockMatchMedia(true);
    render(
      <CardShell>
        <p>Card content</p>
      </CardShell>,
    );
    expect(screen.queryByTestId("card-shell-sheen")).not.toBeInTheDocument();
    const shell = screen.getByTestId("card-shell");
    expect(shell.style.transform).toBe("");
  });
});
