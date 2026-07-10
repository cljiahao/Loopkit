import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0015_loopkit_vendor_join.sql",
  "utf8",
);

describe("0015 vendor join", () => {
  it("defines vendor_active_programs, granted to anon", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.vendor_active_programs\(p_vendor uuid\)/i,
    );
    expect(sql).toMatch(
      /grant execute on function loopkit\.vendor_active_programs\(uuid\) to anon/i,
    );
  });

  it("defines vendor_join with the same phone guard as enroll_card, granted to anon", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.vendor_join\(p_vendor uuid, p_phone text\)/i,
    );
    expect(sql).toMatch(/\^\\\+65\[3689\]\[0-9\]\{7\}\$/);
    expect(sql).toMatch(
      /grant execute on function loopkit\.vendor_join\(uuid, text\) to anon/i,
    );
  });

  it("only auto-enrolls programs the phone doesn't already have a card for", () => {
    expect(sql).toMatch(
      /not exists \(\s*select 1 from loopkit\.cards c\s*where c\.program_id = p\.id and c\.phone = p_phone/i,
    );
  });

  it("delegates seeding to enroll_card rather than duplicating it", () => {
    expect(sql).toMatch(
      /perform loopkit\.enroll_card\(v_program\.id, p_phone\)/i,
    );
  });

  it("only fans out enrollment into active programs", () => {
    expect(sql).toMatch(
      /where p\.vendor_id = p_vendor and p\.active\s*\n\s*and not exists/i,
    );
  });

  it("reads back every existing card regardless of the program's active status", () => {
    expect(sql).toMatch(
      /from loopkit\.cards c\s*join loopkit\.programs p on p\.id = c\.program_id\s*where p\.vendor_id = p_vendor and c\.phone = p_phone/i,
    );
  });
});
