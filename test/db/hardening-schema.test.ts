import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Cheap guard against silent drift in the hand-written 0008 migration — regex
// presence checks only, not a substitute for running it against real Postgres.
const sql = readFileSync(
  "supabase/migrations/0008_loopkit_hardening.sql",
  "utf8",
);

describe("0008 loopkit hardening", () => {
  it("A1: recreates card_view returning the stamp_count column", () => {
    expect(sql).toMatch(
      /drop function if exists loopkit\.card_view\(uuid, ?text\)/i,
    );
    expect(sql).toMatch(/create or replace function loopkit\.card_view\(/i);
    expect(sql).toMatch(
      /name text, type text, config jsonb, state jsonb, stamp_count int/i,
    );
    expect(sql).toMatch(
      /grant execute on function loopkit\.card_view\([^)]*\) to anon/i,
    );
  });

  it("B1: defines a SECURITY DEFINER create_program gate", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.create_program\(/i,
    );
    expect(sql).toMatch(/security definer set search_path = ''/i);
    expect(sql).toMatch(/raise insufficient_privilege/i);
    expect(sql).toMatch(/loopkit\.is_pro\(v_uid\)/i);
    expect(sql).toMatch(/vendor_id = v_uid/i);
    expect(sql).toMatch(
      /grant execute on function loopkit\.create_program\([^)]*\) to authenticated/i,
    );
  });

  it("B1: revokes direct insert on programs from authenticated", () => {
    expect(sql).toMatch(
      /revoke insert on loopkit\.programs from authenticated/i,
    );
  });

  it("B2: enroll_card only enrolls into active programs", () => {
    expect(sql).toMatch(/create or replace function loopkit\.enroll_card\(/i);
    expect(sql).toMatch(/where id = p_program and active/i);
    expect(sql).toMatch(
      /grant execute on function loopkit\.enroll_card\([^)]*\) to anon/i,
    );
  });

  it("B3: drops the redundant card_status function", () => {
    expect(sql).toMatch(
      /drop function if exists loopkit\.card_status\(uuid, ?text\)/i,
    );
  });
});
