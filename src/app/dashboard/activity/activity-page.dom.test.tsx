// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VendorActivityList } from "./page";
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

describe("VendorActivityList", () => {
  it("renders an event's phone and program badge", () => {
    render(<VendorActivityList activity={activity} />);
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
  });

  it("shows an empty state with zero activity", () => {
    render(<VendorActivityList activity={[]} />);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
});
