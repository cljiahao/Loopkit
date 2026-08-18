import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cheap guard against silent drift in the hand-written 0039 migration —
// regex presence checks only, not a substitute for running it against real
// Postgres.
const sql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/0039_admin_audit_immutable.sql",
  ),
  "utf8",
);

describe("0039_admin_audit_immutable.sql", () => {
  it("revokes update and delete on admin_audit from service_role", () => {
    expect(sql).toMatch(
      /revoke update, delete on loopkit\.admin_audit from service_role/,
    );
  });

  it("does not revoke select or insert (the app's only write path)", () => {
    expect(sql).not.toMatch(/revoke[^;]*\bselect\b[^;]*admin_audit/i);
    expect(sql).not.toMatch(/revoke[^;]*\binsert\b[^;]*admin_audit/i);
  });
});
