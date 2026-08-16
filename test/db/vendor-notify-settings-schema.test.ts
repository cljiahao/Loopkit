import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0038_vendor_notify_settings.sql",
  "utf8",
);

describe("0038 vendor notify settings", () => {
  it("creates vendor_notify_settings keyed on vendor_id, default-true flag", () => {
    expect(sql).toMatch(/create table loopkit\.vendor_notify_settings/i);
    expect(sql).toMatch(
      /vendor_id\s+uuid primary key references auth\.users\(id\) on delete cascade/i,
    );
    expect(sql).toMatch(
      /customer_telegram_notify_enabled\s+boolean not null default true/i,
    );
  });

  it("enables RLS with an own-row policy covering select/insert/update", () => {
    expect(sql).toMatch(
      /alter table loopkit\.vendor_notify_settings enable row level security/i,
    );
    expect(sql).toMatch(
      /create policy vendor_notify_settings_own on loopkit\.vendor_notify_settings\s+for all using \(vendor_id = \(select auth\.uid\(\)\)\)\s+with check \(vendor_id = \(select auth\.uid\(\)\)\)/i,
    );
  });

  it("grants select/insert/update to authenticated — a vendor writes its own row directly, no service-role-only gate", () => {
    expect(sql).toMatch(
      /grant select, insert, update on loopkit\.vendor_notify_settings to authenticated/i,
    );
  });
});
