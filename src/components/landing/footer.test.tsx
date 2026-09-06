// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "./footer";

describe("Footer", () => {
  it("renders the wordmark, tagline, copyright line, and sign-in link matching qkit's single-row layout", () => {
    render(<Footer />);

    expect(screen.getByRole("link", { name: "loopkit home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByText("Loyalty for Singapore’s small vendors."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("© 2026 loopkit · a Merqo kit"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Vendor sign in →" }),
    ).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/legal/terms",
    );
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/legal/privacy",
    );
  });

  it("links to the About page", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
  });
});
