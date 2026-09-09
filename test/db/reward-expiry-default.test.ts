import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0046_loopkit_reward_expiry_default.sql",
  "utf8",
);

describe("0046 reward expiry default", () => {
  it("re-creates loopkit.create_program", () => {
    expect(sql).toMatch(/create or replace function loopkit\.create_program/i);
  });

  it("defaults p_reward_expiry_days to 90", () => {
    expect(sql).toMatch(/p_reward_expiry_days\s+int\s+default\s+90/i);
  });

  it("does not backfill existing programs", () => {
    expect(sql).not.toMatch(
      /update\s+loopkit\.programs\s+set[\s\S]*reward_expiry_days/i,
    );
  });

  it("does not touch the voucher-granting functions", () => {
    expect(sql).not.toMatch(/grant_reward_voucher|redeem_voucher_by_token/i);
  });
});
