import { describe, it, expect } from "vitest";
import { rewardReady } from "@/lib/loyalty";

describe("rewardReady", () => {
  it("is true when the count meets the requirement", () => {
    expect(rewardReady(10, 10)).toBe(true);
  });

  it("is false when the count is below the requirement", () => {
    expect(rewardReady(9, 10)).toBe(false);
  });

  it("is true when the count exceeds the requirement", () => {
    expect(rewardReady(11, 10)).toBe(true);
  });
});
