// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorthALook } from "./worth-a-look";

describe("WorthALook", () => {
  it("renders one link per item with the right segment href", () => {
    render(
      <WorthALook
        items={[
          { kind: "gone-quiet", count: 6 },
          { kind: "one-away", count: 4 },
        ]}
      />,
    );
    expect(
      screen.getByRole("link", { name: /6 regulars have gone quiet/i }),
    ).toHaveAttribute("href", "/dashboard/customers?seg=lapsed");
    expect(
      screen.getByRole("link", { name: /4 are one stamp from a reward/i }),
    ).toHaveAttribute("href", "/dashboard/customers?seg=ready");
  });

  it("renders nothing when there are no items", () => {
    const { container } = render(<WorthALook items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("uses singular wording for a count of one", () => {
    render(<WorthALook items={[{ kind: "gone-quiet", count: 1 }]} />);
    expect(screen.getByText(/1 regular has gone quiet/i)).toBeInTheDocument();
  });
});
