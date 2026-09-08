import { describe, expect, it } from "vitest";
import { pickDefaultCounterProgram } from "./counter-view";

describe("pickDefaultCounterProgram", () => {
  const progs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("picks the highest active count", () => {
    expect(pickDefaultCounterProgram(progs, { a: 2, b: 9, c: 4 })).toBe("b");
  });
  it("breaks ties toward the earlier program", () => {
    expect(pickDefaultCounterProgram(progs, { a: 5, b: 5, c: 1 })).toBe("a");
  });
  it("falls back to the first program when all counts are zero or missing", () => {
    expect(pickDefaultCounterProgram(progs, {})).toBe("a");
  });
  it("returns null for no programs", () => {
    expect(pickDefaultCounterProgram([], {})).toBeNull();
  });
});
