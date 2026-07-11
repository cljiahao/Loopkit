import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0017_loopkit_vendor_profile.sql",
  "utf8",
);

describe("0017 vendor profile", () => {
  it("creates loopkit.vendors keyed by vendor_id", () => {
    expect(sql).toMatch(
      /create table loopkit\.vendors \(\s*vendor_id\s+uuid primary key references auth\.users\(id\)/i,
    );
    expect(sql).toMatch(/name\s+text/i);
    expect(sql).toMatch(/phone\s+text/i);
  });

  it("enables RLS with a self-only policy", () => {
    expect(sql).toMatch(
      /alter table loopkit\.vendors enable row level security/i,
    );
    expect(sql).toMatch(
      /create policy vendors_own on loopkit\.vendors\s*\n\s*for all using \(vendor_id = \(select auth\.uid\(\)\)\)/i,
    );
  });

  it("grants authenticated select/insert/update, service_role all", () => {
    expect(sql).toMatch(
      /grant select, insert, update on loopkit\.vendors to authenticated/i,
    );
    expect(sql).toMatch(/grant all on loopkit\.vendors to service_role/i);
  });

  it("creates the public vendor-images bucket with per-vendor-folder object policies", () => {
    expect(sql).toMatch(
      /insert into storage\.buckets \(id, name, public\)\s*\n\s*values \('vendor-images', 'vendor-images', true\)/i,
    );
    expect(sql).toMatch(/vendor_images_public_read/i);
    expect(sql).toMatch(/vendor_images_vendor_insert/i);
    expect(sql).toMatch(
      /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/,
    );
  });
});
