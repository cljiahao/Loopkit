import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cheap guard against silent drift in the hand-written migration — not a
// substitute for running it against a real Postgres (see supabase/tests for
// that). Regex presence checks only; no SQL parsing.
const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0001_loopkit_core.sql"),
  "utf8",
);

describe("0001_loopkit_core.sql", () => {
  it("creates the loopkit schema", () => {
    expect(sql).toMatch(/create schema if not exists loopkit/);
  });

  it.each(["programs", "cards", "stamp_events"])(
    "creates table loopkit.%s",
    (table) => {
      expect(sql).toMatch(new RegExp(`create table loopkit\\.${table}\\b`));
    },
  );

  it.each(["owns_program", "add_stamp", "redeem", "card_status"])(
    "defines function loopkit.%s",
    (fn) => {
      expect(sql).toMatch(
        new RegExp(`create or replace function loopkit\\.${fn}\\(`),
      );
    },
  );

  it.each(["programs", "cards", "stamp_events"])(
    "enables row level security on loopkit.%s",
    (table) => {
      expect(sql).toMatch(
        new RegExp(
          `alter table loopkit\\.${table}\\s+enable row level security`,
        ),
      );
    },
  );

  it("has a unique (program_id, phone) constraint on cards", () => {
    expect(sql).toMatch(/unique \(program_id, phone\)/);
  });
});
