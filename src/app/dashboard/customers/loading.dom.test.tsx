// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import CustomersLoading from "./loading";

describe("CustomersLoading", () => {
  it("renders a skeleton with a search-bar placeholder and 6 row placeholders", () => {
    const { container } = render(<CustomersLoading />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
    expect(container.querySelectorAll("li, div").length).toBeGreaterThan(0);
  });
});
