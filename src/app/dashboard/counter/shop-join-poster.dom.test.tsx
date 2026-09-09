// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShopJoinPoster } from "./shop-join-poster";

describe("ShopJoinPoster", () => {
  const svg = '<svg data-testid="qr"><rect /></svg>';

  it("shows the shop name, the join CTA copy, and the QR", () => {
    render(
      <ShopJoinPoster
        shopName="Kopi Corner"
        qrSvgMarkup={svg}
        link="https://loopkit.app/c?v=v1"
      />,
    );
    expect(screen.getByText("Kopi Corner")).toBeInTheDocument();
    expect(screen.getByText("Join our loyalty card")).toBeInTheDocument();
    expect(
      screen.getByText("Scan to join. Just your phone number."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("qr")).toBeInTheDocument();
  });

  it("shows the LoopKit branding line by default (free tier)", () => {
    render(
      <ShopJoinPoster
        shopName="Kopi Corner"
        qrSvgMarkup={svg}
        link="https://loopkit.app/c?v=v1"
      />,
    );
    expect(screen.getByText("via LoopKit")).toBeInTheDocument();
  });

  it("hides the LoopKit branding line for a Pro vendor", () => {
    render(
      <ShopJoinPoster
        shopName="Kopi Corner"
        qrSvgMarkup={svg}
        link="https://loopkit.app/c?v=v1"
        showBranding={false}
      />,
    );
    expect(screen.queryByText("via LoopKit")).not.toBeInTheDocument();
  });

  it("forces a white background on the printed surface, not bg-card", () => {
    const { container } = render(
      <ShopJoinPoster
        shopName="Kopi Corner"
        qrSvgMarkup={svg}
        link="https://loopkit.app/c?v=v1"
      />,
    );
    const poster = container.querySelector("#shop-join-poster");
    expect(poster).not.toBeNull();
    expect(poster?.className).toContain("bg-white");
    expect(poster?.className).not.toContain("bg-card");
  });
});
