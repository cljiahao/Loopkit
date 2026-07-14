import { describe, expect, it } from "vitest";
import { mapActivityRow, listActivity } from "@/lib/activity";

describe("mapActivityRow", () => {
  const programNameById = { p1: "Coffee Stamps" };
  const card = { id: "c1", phone: "+6591234567", program_id: "p1" };

  it("maps a stamp event", () => {
    const row = mapActivityRow(
      {
        id: "e1",
        card_id: "c1",
        kind: "stamp",
        created_at: "2026-07-10T00:00:00Z",
      },
      card,
      programNameById,
    );
    expect(row).toEqual({
      id: "e1",
      phone: "+6591234567",
      programName: "Coffee Stamps",
      kind: "stamp",
      isReward: false,
      label: "stamp",
      createdAt: "2026-07-10T00:00:00Z",
    });
  });

  it("maps a redeem event as a reward", () => {
    const row = mapActivityRow(
      {
        id: "e2",
        card_id: "c1",
        kind: "redeem",
        created_at: "2026-07-10T00:00:00Z",
      },
      card,
      programNameById,
    );
    expect(row?.isReward).toBe(true);
    expect(row?.label).toBe("redeem");
  });

  it("maps a won visit as 'Won' and a reward", () => {
    const row = mapActivityRow(
      {
        id: "e3",
        card_id: "c1",
        kind: "visit",
        payload: { won: true },
        created_at: "2026-07-10T00:00:00Z",
      },
      card,
      programNameById,
    );
    expect(row?.label).toBe("Won");
    expect(row?.isReward).toBe(true);
  });

  it("maps a losing visit as 'Visit', not a reward", () => {
    const row = mapActivityRow(
      {
        id: "e4",
        card_id: "c1",
        kind: "visit",
        payload: { won: false },
        created_at: "2026-07-10T00:00:00Z",
      },
      card,
      programNameById,
    );
    expect(row?.label).toBe("Visit");
    expect(row?.isReward).toBe(false);
  });

  it("returns null when the event's card is missing", () => {
    const row = mapActivityRow(
      {
        id: "e5",
        card_id: "unknown",
        kind: "stamp",
        created_at: "2026-07-10T00:00:00Z",
      },
      undefined,
      programNameById,
    );
    expect(row).toBeNull();
  });

  it("falls back to '—' when the card's program has no name entry", () => {
    const row = mapActivityRow(
      {
        id: "e6",
        card_id: "c1",
        kind: "stamp",
        created_at: "2026-07-10T00:00:00Z",
      },
      { id: "c1", phone: "+6591234567", program_id: "unknown-program" },
      programNameById,
    );
    expect(row?.programName).toBe("—");
  });
});
