// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RouteError from "./error";

describe("RouteError", () => {
  it("renders the heading and message, and logs the error", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const reset = vi.fn();
    const error = new Error("boom");
    render(<RouteError error={error} reset={reset} />);

    expect(
      screen.getByRole("heading", { name: "That didn't load" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/a hiccup on our end/i)).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith("Unhandled error", error);
    consoleError.mockRestore();
  });

  it("calls reset when Try again is clicked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<RouteError error={new Error("boom")} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
