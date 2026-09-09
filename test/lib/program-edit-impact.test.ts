import { describe, it, expect } from "vitest";
import {
  isProgressAffecting,
  describeEditImpact,
} from "@/lib/program-edit-impact";

const base = { stamps_required: 8, reward_text: "Free coffee" };

describe("isProgressAffecting", () => {
  it("is false when nothing relevant changed", () => {
    expect(isProgressAffecting(base, { ...base })).toBe(false);
  });

  it("is false when reward_text differs only by surrounding whitespace", () => {
    expect(
      isProgressAffecting(base, { ...base, reward_text: "  Free coffee " }),
    ).toBe(false);
  });

  it("is true when stamps_required changed", () => {
    expect(isProgressAffecting(base, { ...base, stamps_required: 10 })).toBe(
      true,
    );
  });

  it("is true when reward_text changed", () => {
    expect(
      isProgressAffecting(base, { ...base, reward_text: "Free pastry" }),
    ).toBe(true);
  });
});

describe("describeEditImpact", () => {
  it("opens with the customer count", () => {
    const lines = describeEditImpact(base, { ...base, stamps_required: 10 }, 3);
    expect(lines[0]).toBe("3 customers have a card on this program.");
  });

  it("uses singular wording for one customer", () => {
    const lines = describeEditImpact(base, { ...base, stamps_required: 10 }, 1);
    expect(lines[0]).toBe("1 customer has a card on this program.");
  });

  it("describes a goal increase", () => {
    const lines = describeEditImpact(base, { ...base, stamps_required: 10 }, 3);
    expect(lines).toContain(
      "They keep the stamps they have. The goal moves from 8 to 10.",
    );
  });

  it("describes a goal decrease", () => {
    const lines = describeEditImpact(base, { ...base, stamps_required: 5 }, 3);
    expect(lines).toContain(
      "They keep the stamps they have. The goal drops from 8 to 5, so some may already have earned a reward.",
    );
  });

  it("describes a reward wording change and quotes the new text", () => {
    const lines = describeEditImpact(
      base,
      { ...base, reward_text: "Free pastry" },
      2,
    );
    expect(lines).toContain(
      'Rewards already earned keep the current wording. New rewards will read "Free pastry".',
    );
  });

  it("returns intro, stamps, then reward in a stable order for a combined change", () => {
    const lines = describeEditImpact(
      base,
      { stamps_required: 10, reward_text: "Free pastry" },
      4,
    );
    expect(lines).toEqual([
      "4 customers have a card on this program.",
      "They keep the stamps they have. The goal moves from 8 to 10.",
      'Rewards already earned keep the current wording. New rewards will read "Free pastry".',
    ]);
  });

  it("still returns lines when cardCount is 0 (the caller gates on count)", () => {
    const lines = describeEditImpact(base, { ...base, stamps_required: 10 }, 0);
    expect(lines[0]).toBe("0 customers have a card on this program.");
    expect(lines.length).toBeGreaterThan(1);
  });
});
