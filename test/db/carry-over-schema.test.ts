import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0018_loopkit_carry_over.sql",
  "utf8",
);

describe("0018 carry over", () => {
  it("adds a carry_over_stamps column defaulting to false", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column carry_over_stamps boolean not null default false/i,
    );
  });

  it("create_program accepts an optional carry-over flag", () => {
    expect(sql).toMatch(/p_carry_over_stamps\s+boolean default false/i);
    expect(sql).toMatch(
      /grant execute on function loopkit\.create_program\(\s*text, text, int, text, jsonb, int, boolean, boolean\s*\) to authenticated/i,
    );
  });

  it("enroll_card seeds stamp_count from a same-type predecessor's card when carry_over_stamps is set", () => {
    expect(sql).toMatch(/if v_program\.carry_over_stamps then/i);
    expect(sql).toMatch(/where p\.replaced_by = v_program\.id/i);
    expect(sql).toMatch(
      /v_predecessor\.type = 'stamp' and v_program\.type = 'stamp'/i,
    );
    expect(sql).toMatch(
      /least\(coalesce\(v_seed_stamp_count, 0\), v_program\.stamps_required\)/i,
    );
  });

  it("keeps enroll_card's head_start branches (stamp/plant/streak) as a fallback", () => {
    expect(sql).toMatch(/if not v_carried and v_program\.head_start then/i);
    expect(sql).toMatch(/elsif v_program\.type = 'plant' then/i);
    expect(sql).toMatch(/elsif v_program\.type = 'streak' then/i);
  });

  it("widens vendor_join with replaced_by_stamp_count via a second left join", () => {
    expect(sql).toMatch(/replaced_by_name text, replaced_by_stamp_count int/i);
    expect(sql).toMatch(
      /left join loopkit\.cards nc on nc\.program_id = p\.replaced_by and nc\.phone = c\.phone/i,
    );
    expect(sql).toMatch(/r\.name, nc\.stamp_count/i);
  });
});
