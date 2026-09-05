import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cheap guard against silent drift in the hand-written 0043 migration —
// regex presence checks only. Real behavior (RLS enabled, zero policies,
// anon/authenticated both rejected) is covered by supabase/tests/rls.test.sql
// (pgTAP, run against real Postgres in CI's "db" job).
const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0043_legal_check_state.sql"),
  "utf8",
);

describe("0043_legal_check_state.sql", () => {
  it("creates the table keyed by email", () => {
    expect(sql).toMatch(/create table loopkit\.legal_check_state/i);
    expect(sql).toMatch(/email\s+TEXT\s+PRIMARY KEY/);
    expect(sql).toMatch(/checked_at\s+TIMESTAMPTZ\s+NOT NULL DEFAULT now\(\)/);
    expect(sql).toMatch(/is_current\s+BOOLEAN\s+NOT NULL/);
  });

  it("enables RLS with no policies (service-role-only)", () => {
    expect(sql).toMatch(
      /ALTER TABLE loopkit\.legal_check_state ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).not.toMatch(/create policy/i);
  });

  it("grants select/insert/update to service_role only", () => {
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE ON loopkit\.legal_check_state TO service_role/,
    );
    expect(sql).not.toMatch(/TO authenticated/);
    expect(sql).not.toMatch(/TO anon/);
  });
});
