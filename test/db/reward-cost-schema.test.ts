import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0045_loopkit_reward_cost.sql",
  "utf8",
);

describe("0045 reward cost", () => {
  it("adds a nullable reward_cost_cents integer to loopkit.programs", () => {
    expect(sql).toMatch(
      /alter table loopkit\.programs\s+add column (if not exists )?reward_cost_cents integer/i,
    );
  });

  it("constrains it to null or non-negative", () => {
    expect(sql).toMatch(
      /check \(\s*reward_cost_cents is null or reward_cost_cents >= 0\s*\)/i,
    );
  });

  it("adds no new RLS policy (the FOR ALL owner policy already covers it)", () => {
    expect(sql).not.toMatch(/create policy/i);
  });
});
