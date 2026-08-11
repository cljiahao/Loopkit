// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import DashboardLoading from "./loading";

describe("DashboardLoading", () => {
  it("renders a skeleton with pulse placeholders for the heading and program cards", () => {
    const { container } = render(<DashboardLoading />);

    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(
      0,
    );
    expect(container.querySelectorAll(".rounded-2xl").length).toBe(2);
  });
});
