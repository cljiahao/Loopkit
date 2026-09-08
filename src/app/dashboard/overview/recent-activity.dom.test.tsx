// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentActivity } from "./recent-activity";
import type { VendorActivityRow } from "@/lib/activity";

const row = (over: Partial<VendorActivityRow> = {}): VendorActivityRow => ({
  id: Math.random().toString(),
  phone: "+6591234567",
  programName: "Stamp Card",
  kind: "stamp",
  isReward: false,
  isAdjust: false,
  label: "Visit",
  reason: null,
  createdAt: "2026-09-08T02:00:00Z",
  ...over,
});

describe("RecentActivity", () => {
  it("caps the list at 6 rows", () => {
    render(
      <RecentActivity
        rows={Array.from({ length: 10 }, (_, i) => row({ id: `e${i}` }))}
      />,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });

  it("shows a Serve link for a visit row when the program id resolves", () => {
    render(
      <RecentActivity
        rows={[row({ id: "e1" })]}
        programIdByName={{ "Stamp Card": "p1" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Serve" })).toHaveAttribute(
      "href",
      "/dashboard/counter?p=p1&phone=%2B6591234567",
    );
  });

  it("shows no Serve link on a reward row", () => {
    render(
      <RecentActivity
        rows={[row({ id: "e2", isReward: true, label: "redeem" })]}
        programIdByName={{ "Stamp Card": "p1" }}
      />,
    );
    expect(screen.queryByRole("link", { name: "Serve" })).toBeNull();
  });

  it("masks the phone number", () => {
    render(<RecentActivity rows={[row()]} />);
    expect(screen.getByText("9123 ****")).toBeInTheDocument();
  });
});
