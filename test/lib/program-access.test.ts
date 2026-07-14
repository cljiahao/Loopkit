import { describe, it, expect } from "vitest";
import {
  currentProgram,
  canCreateProgram,
  getEntitlement,
} from "@/lib/program";
import type { Program } from "@/lib/program";

const program = (id: string): Program => ({
  id,
  name: `Program ${id}`,
  stamps_required: 10,
  reward_text: "Free kopi",
  type: "stamp",
  config: {},
  active: true,
  head_start: false,
  replaced_by: null,
  carry_over_stamps: false,
});

describe("currentProgram", () => {
  it("returns null when the vendor has no programs", () => {
    expect(currentProgram([])).toBeNull();
    expect(currentProgram([], "anything")).toBeNull();
  });

  it("returns the first program when no id is requested", () => {
    const list = [program("a"), program("b")];
    expect(currentProgram(list)?.id).toBe("a");
  });

  it("returns the requested program when the vendor owns it", () => {
    const list = [program("a"), program("b")];
    expect(currentProgram(list, "b")?.id).toBe("b");
  });

  it("falls back to the first program when the requested id is not owned", () => {
    const list = [program("a"), program("b")];
    expect(currentProgram(list, "zzz")?.id).toBe("a");
  });

  it("ignores an empty requested id and returns the first", () => {
    const list = [program("a"), program("b")];
    expect(currentProgram(list, "")?.id).toBe("a");
  });
});

describe("getEntitlement", () => {
  it("free vendor gets a 1-active-program cap", () => {
    expect(getEntitlement(false)).toEqual({
      tier: "free",
      maxActivePrograms: 1,
      maxLiveInPlayPrograms: 2,
    });
  });

  it("pro vendor gets unlimited", () => {
    expect(getEntitlement(true)).toEqual({
      tier: "pro",
      maxActivePrograms: null,
      maxLiveInPlayPrograms: null,
    });
  });
});

describe("canCreateProgram", () => {
  it("lets a free vendor create their first program", () => {
    expect(canCreateProgram(getEntitlement(false), 0)).toBe(true);
  });

  it("blocks a free vendor at the one-program limit", () => {
    expect(canCreateProgram(getEntitlement(false), 1)).toBe(false);
    expect(canCreateProgram(getEntitlement(false), 2)).toBe(false);
  });

  it("lets a Pro vendor create regardless of count", () => {
    expect(canCreateProgram(getEntitlement(true), 0)).toBe(true);
    expect(canCreateProgram(getEntitlement(true), 1)).toBe(true);
    expect(canCreateProgram(getEntitlement(true), 50)).toBe(true);
  });
});
