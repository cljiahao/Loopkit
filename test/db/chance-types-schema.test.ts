import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0010_loopkit_chance_types.sql",
  "utf8",
);

describe("0010 chance types migration", () => {
  it("drops the old programs.type check constraint", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs drop constraint if exists programs_type_check/i,
    );
  });
  it("widens programs.type to admit wheel + scratch", () => {
    expect(sql).toMatch(/add constraint programs_type_check/i);
    expect(sql).toMatch(
      /check \(type in \('stamp','lucky','plant','wheel','scratch'\)\)/i,
    );
  });
});
