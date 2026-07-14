// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityTable } from "./activity-table";
import type { VendorActivityRow } from "@/lib/activity";

const activity: VendorActivityRow[] = [
  {
    id: "e1",
    phone: "+6591234567",
    programName: "Coffee Stamps",
    kind: "stamp",
    isReward: false,
    label: "stamp",
    createdAt: "2026-07-10T00:00:00Z",
  },
];

describe("ActivityTable", () => {
  it("renders an event's phone and program badge when showProgram is true", () => {
    render(<ActivityTable activity={activity} showProgram />);
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Program" }),
    ).toBeInTheDocument();
  });

  it("omits the Program column when showProgram is false", () => {
    render(<ActivityTable activity={activity} showProgram={false} />);
    expect(
      screen.queryByRole("columnheader", { name: "Program" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Coffee Stamps")).not.toBeInTheDocument();
  });

  it("shows an empty state with zero activity", () => {
    render(<ActivityTable activity={[]} showProgram />);
    expect(
      screen.getByText(/no activity matches these filters/i),
    ).toBeInTheDocument();
  });
});
