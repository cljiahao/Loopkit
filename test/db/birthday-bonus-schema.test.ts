import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cheap guard against silent drift in the hand-written 0041 migration —
// regex presence checks only. Real behavior (trigger recursion guard,
// scoping, threshold-crossing reuse) is covered by supabase/tests/rls.test.sql
// (pgTAP, run against real Postgres in CI's "db" job).
const sql = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/0041_loopkit_birthday_bonus.sql",
  ),
  "utf8",
);

describe("0041_loopkit_birthday_bonus.sql", () => {
  it("adds birth_month/birth_day/last_birthday_reward_year to customers", () => {
    expect(sql).toMatch(/add column birth_month smallint/);
    expect(sql).toMatch(/add column birth_day smallint/);
    expect(sql).toMatch(/add column last_birthday_reward_year int/);
  });

  it("adds a birthday_bonus_enabled toggle to programs, defaulting off", () => {
    expect(sql).toMatch(
      /add column birthday_bonus_enabled boolean not null default false/,
    );
  });

  it("grants set_customer_birthday to anon (the unauthenticated /c flow)", () => {
    expect(sql).toMatch(
      /grant execute on function loopkit\.set_customer_birthday/,
    );
    const grantIdx = sql.indexOf(
      "grant execute on function loopkit.set_customer_birthday",
    );
    expect(sql.slice(grantIdx, grantIdx + 200)).toContain(
      "to anon, authenticated, service_role",
    );
  });

  it("gates the bonus trigger on stamp/visit kinds, type='stamp', and the per-program toggle", () => {
    expect(sql).toMatch(/if new\.kind not in \('stamp', 'visit'\) then/);
    expect(sql).toMatch(/v_program_type <> 'stamp' or not v_bonus_enabled/);
  });

  it("updates last_birthday_reward_year before granting the bonus, to guard recursion", () => {
    const updateIdx = sql.indexOf(
      "set last_birthday_reward_year = extract(year",
    );
    const grantIdx = sql.indexOf(
      "perform loopkit._add_stamp_unchecked(v_program_id, v_phone);",
    );
    expect(updateIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeLessThan(grantIdx);
  });

  it("does not change add_stamp's authorization gate", () => {
    expect(sql).toMatch(/if not loopkit\.owns_program\(p_program\) then/);
  });
});
