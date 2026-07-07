import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync("supabase/migrations/0004_loopkit_engine.sql", "utf8");

describe("0004 engine migration", () => {
  it("adds type + config to programs", () => {
    expect(sql).toMatch(/alter table loopkit\.programs/i);
    expect(sql).toMatch(/add column type text not null default 'stamp'/i);
    expect(sql).toMatch(/check \(type in \('stamp','lucky','plant'\)\)/i);
    expect(sql).toMatch(/add column config jsonb not null default '\{\}'/i);
  });
  it("adds state + last_event_at to cards", () => {
    expect(sql).toMatch(/add column state jsonb not null default '\{\}'/i);
    expect(sql).toMatch(/add column last_event_at timestamptz/i);
  });
  it("generalizes stamp_events kind + adds payload", () => {
    expect(sql).toMatch(/kind in \('stamp','redeem','visit','win'\)/i);
    expect(sql).toMatch(/add column (if not exists )?payload jsonb/i);
  });
  it("backfills existing stamp rows", () => {
    expect(sql).toMatch(/jsonb_build_object\('stamps_required'/i);
    expect(sql).toMatch(/jsonb_build_object\('stamp_count'/i);
  });
});
