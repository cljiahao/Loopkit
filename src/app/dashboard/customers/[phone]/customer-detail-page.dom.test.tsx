// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { getCustomerDetailMock, listActivityMock } = vi.hoisted(() => ({
  getCustomerDetailMock: vi.fn(),
  listActivityMock: vi.fn(),
}));

vi.mock("@/features/auth", () => ({ requireVendor: vi.fn(async () => ({})) }));
vi.mock("@/lib/customers", () => ({
  getCustomerDetail: getCustomerDetailMock,
}));
vi.mock("@/lib/activity", () => ({ listActivity: listActivityMock }));
vi.mock("@/lib/program", () => ({
  listPrograms: vi.fn(async () => [
    { id: "p1", name: "Coffee Stamps", type: "stamp" },
    { id: "p2", name: "Lucky Tap", type: "lucky" },
  ]),
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));

import CustomerDetailPage from "./page";

describe("CustomerDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listActivityMock.mockResolvedValue({ rows: [], hasMore: false });
  });

  it("renders the customer's name, cards, and an Adjust form only for stamp-type programs", async () => {
    getCustomerDetailMock.mockResolvedValue({
      phone: "+6591234567",
      name: "Jane",
      lastSeenAt: "2026-07-10T00:00:00Z",
      cards: [
        {
          programId: "p1",
          programName: "Coffee Stamps",
          programType: "stamp",
          stampCount: 4,
          rewardCount: 1,
          updatedAt: "2026-07-10T00:00:00Z",
        },
        {
          programId: "p2",
          programName: "Lucky Tap",
          programType: "lucky",
          stampCount: 0,
          rewardCount: 0,
          updatedAt: "2026-07-10T00:00:00Z",
        },
      ],
    });

    const ui = await CustomerDetailPage({
      params: Promise.resolve({ phone: "%2B6591234567" }),
    });
    render(ui);

    expect(screen.getByRole("heading", { name: "Jane" })).toBeInTheDocument();
    expect(screen.getByText("Coffee Stamps")).toBeInTheDocument();
    expect(screen.getByText("Lucky Tap")).toBeInTheDocument();
    expect(screen.getByText(/4 stamps/)).toBeInTheDocument();
    // Only one Adjust trigger — the stamp-type card, not the lucky one.
    expect(
      screen.getAllByRole("button", { name: "Adjust stamps" }),
    ).toHaveLength(1);
  });

  it("falls back to the phone number when no name is on file", async () => {
    getCustomerDetailMock.mockResolvedValue({
      phone: "+6591234567",
      name: null,
      lastSeenAt: null,
      cards: [
        {
          programId: "p1",
          programName: "Coffee Stamps",
          programType: "stamp",
          stampCount: 1,
          rewardCount: 0,
          updatedAt: "2026-07-10T00:00:00Z",
        },
      ],
    });

    const ui = await CustomerDetailPage({
      params: Promise.resolve({ phone: "%2B6591234567" }),
    });
    render(ui);

    expect(
      screen.getByRole("heading", { name: "+6591234567" }),
    ).toBeInTheDocument();
  });

  it("calls notFound for an invalid phone route param", async () => {
    await expect(
      CustomerDetailPage({ params: Promise.resolve({ phone: "not-a-phone" }) }),
    ).rejects.toThrow("NOT_FOUND");
    expect(getCustomerDetailMock).not.toHaveBeenCalled();
  });

  it("calls notFound when the customer has no cards and no name on file", async () => {
    getCustomerDetailMock.mockResolvedValue({
      phone: "+6591234567",
      name: null,
      lastSeenAt: null,
      cards: [],
    });

    await expect(
      CustomerDetailPage({
        params: Promise.resolve({ phone: "%2B6591234567" }),
      }),
    ).rejects.toThrow("NOT_FOUND");
  });
});
