import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0006_loopkit_card_token.sql",
  "utf8",
);

describe("0006 card token", () => {
  it("adds a unique card_token to cards", () => {
    expect(sql).toMatch(/add column card_token text not null unique/i);
  });
  it("defines enroll_card (public) + card_view + card_by_token", () => {
    expect(sql).toMatch(/create or replace function loopkit\.enroll_card\(/i);
    expect(sql).toMatch(/create or replace function loopkit\.card_view\(/i);
    expect(sql).toMatch(/create or replace function loopkit\.card_by_token\(/i);
  });
  it("card_by_token is owner-gated", () => {
    expect(sql).toMatch(/owns_program/i);
  });
  it("grants card_view + enroll_card to anon", () => {
    expect(sql).toMatch(
      /grant execute on function loopkit\.card_view\([^)]*\) to anon/i,
    );
    expect(sql).toMatch(
      /grant execute on function loopkit\.enroll_card\([^)]*\) to anon/i,
    );
  });
});
