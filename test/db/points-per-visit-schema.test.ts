// test/db/points-per-visit-schema.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0026_loopkit_points_per_visit.sql",
  "utf8",
);

describe("0026 points-per-visit migration", () => {
  it("widens the stamps_required range to 100,000 via a dynamic constraint lookup, not a guessed name", () => {
    expect(sql).toMatch(/select conname into v_constraint_name/i);
    expect(sql).toMatch(/from pg_constraint/i);
    expect(sql).toMatch(
      /add constraint programs_stamps_required_check\s+check \(stamps_required between 2 and 100000\)/i,
    );
  });

  it("recreates add_stamp reading points_per_visit from config with a coalesce(...,1) fallback", () => {
    expect(sql).toMatch(/create or replace function loopkit\.add_stamp/i);
    expect(sql).toMatch(
      /coalesce\(\(v_config->>'points_per_visit'\)::int,\s*1\)/i,
    );
  });

  it("applies v_amount to both the first-stamp insert and the existing-card update", () => {
    expect(sql).toMatch(/values \(p_program, p_phone, v_amount\)/i);
    expect(sql).toMatch(/set stamp_count = stamp_count \+ v_amount/i);
  });
});
