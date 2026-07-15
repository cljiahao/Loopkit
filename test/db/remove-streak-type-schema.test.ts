// test/db/remove-streak-type-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0025_loopkit_remove_streak_type.sql",
  "utf8",
);

describe("0025 remove streak type migration", () => {
  it("drops the old programs.type check constraint", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs drop constraint if exists programs_type_check/i,
    );
  });

  it("narrows programs.type to exclude streak", () => {
    expect(sql).toMatch(/add constraint programs_type_check/i);
    expect(sql).toMatch(
      /check \(type in \('stamp','lucky','plant','wheel','scratch'\)\)/i,
    );
    expect(sql).not.toMatch(/'streak'/);
  });

  it("recreates enroll_card without a streak branch", () => {
    expect(sql).toMatch(/create or replace function loopkit\.enroll_card/i);
    expect(sql).not.toMatch(/v_program\.type = 'streak'/);
  });
});
