// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  AcceptForm: vi.fn((props: { next: string }) => (
    <div data-testid="accept-form">{props.next}</div>
  )),
}));

vi.mock("./accept-form", () => ({ AcceptForm: mocks.AcceptForm }));

import LegalAcceptPage from "./page";

describe("LegalAcceptPage", () => {
  it("renders the heading and passes a safe next param through to AcceptForm", async () => {
    render(
      await LegalAcceptPage({
        searchParams: Promise.resolve({ next: "/dashboard/settings" }),
      }),
    );

    expect(screen.getByText("Our terms have been updated")).toBeInTheDocument();
    expect(screen.getByTestId("accept-form")).toHaveTextContent(
      "/dashboard/settings",
    );
  });

  it("falls back to /dashboard when next is missing or unsafe", async () => {
    render(
      await LegalAcceptPage({
        searchParams: Promise.resolve({ next: "https://evil.example.com" }),
      }),
    );

    expect(screen.getByTestId("accept-form")).toHaveTextContent("/dashboard");
  });
});
