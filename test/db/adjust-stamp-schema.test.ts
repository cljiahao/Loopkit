import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cheap guard against silent drift in the hand-written 0042 migration —
// regex presence checks only. Real behavior (clamping, ownership,
// event logging) is covered by supabase/tests/rls.test.sql (pgTAP, run
// against real Postgres in CI's "db" job).
const sql = readFileSync(
  path.join(process.cwd(), "supabase/migrations/0042_loopkit_adjust_stamp.sql"),
  "utf8",
);

describe("0042_loopkit_adjust_stamp.sql", () => {
  it("widens stamp_events_kind_check to include 'adjust'", () => {
    expect(sql).toMatch(
      /check \(kind in \('stamp','redeem','visit','win','adjust'\)\)/,
    );
  });

  it("keeps the same ownership gate as add_stamp", () => {
    expect(sql).toMatch(/if not loopkit\.owns_program\(p_program\) then/);
  });

  it("rejects a zero delta and a blank reason before touching the card", () => {
    expect(sql).toMatch(/if p_delta = 0 then/);
    expect(sql).toMatch(
      /if p_reason is null or length\(trim\(p_reason\)\) = 0 then/,
    );
  });

  it("clamps stamp_count at 0 instead of going negative", () => {
    expect(sql).toMatch(/greatest\(0, stamp_count \+ p_delta\)/);
  });

  it("never creates a card — only UPDATEs an existing one", () => {
    expect(sql).not.toMatch(/insert into loopkit\.cards/);
    expect(sql).toMatch(/update loopkit\.cards/);
  });

  it("logs the adjustment with its delta and reason in the event payload", () => {
    expect(sql).toMatch(
      /jsonb_build_object\('delta', p_delta, 'reason', p_reason\)/,
    );
  });

  it("grants execute to authenticated only, not anon", () => {
    expect(sql).toMatch(
      /grant execute on function loopkit\.adjust_stamp\(uuid, text, int, text\) to authenticated;/,
    );
  });
});
