// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CardBurst } from "@/components/card-burst";

describe("CardBurst", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(<CardBurst active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders particles contained within the card (absolute, not fixed)", () => {
    const { container } = render(<CardBurst active={true} />);
    const wrapper = container.querySelector('[aria-hidden="true"]');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper).toHaveClass("absolute");
    expect(wrapper).not.toHaveClass("fixed");
    expect(container.querySelectorAll(".card-burst-piece")).toHaveLength(24);
  });
});
