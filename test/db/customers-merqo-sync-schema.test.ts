import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// Cheap guard against silent drift in the hand-written 0035 migration — regex
// presence checks only, not a substitute for running it against real
// Postgres. Note: no pgTAP coverage exists for these triggers' actual insert
// behavior — loopkit's own CI/local `supabase test db` builds a fresh
// Postgres from only loopkit's migrations (no merqo schema at all, per this
// migration's own guard comment and 0030's precedent), so a live assertion
// that a row lands in merqo.customers isn't reachable from loopkit's own
// pgTAP suite without fabricating a stand-in merqo schema that wouldn't
// exercise the real merqo.upsert_customer function anyway.
const sql = readFileSync(
  "supabase/migrations/0035_loopkit_customers_merqo_sync.sql",
  "utf8",
);

describe("0035 loopkit customers merqo sync", () => {
  it("sync_customer_on_card keeps its existing local loopkit.customers upsert", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.sync_customer_on_card\(\)/i,
    );
    expect(sql).toMatch(
      /insert into loopkit\.customers \(vendor_id, phone, name, first_seen_at, last_seen_at\)\s+values \(v_vendor_id, new\.phone, new\.customer_name, new\.created_at, new\.created_at\)/i,
    );
  });

  it("sync_customer_on_card also calls merqo.upsert_customer, guarded on the function existing", () => {
    const cardFn = sql.slice(
      sql.indexOf("function loopkit.sync_customer_on_card"),
      sql.indexOf("function loopkit.sync_customer_on_activity"),
    );
    expect(cardFn).toMatch(
      /where n\.nspname = 'merqo' and p\.proname = 'upsert_customer'/i,
    );
    expect(cardFn).toMatch(
      /perform merqo\.upsert_customer\(v_vendor_id, new\.phone, new\.customer_name\);/i,
    );
  });

  it("sync_customer_on_activity keeps its existing local last_seen_at update", () => {
    expect(sql).toMatch(
      /create or replace function loopkit\.sync_customer_on_activity\(\)/i,
    );
    expect(sql).toMatch(
      /update loopkit\.customers set last_seen_at = new\.created_at where vendor_id = v_vendor_id and phone = v_phone;/i,
    );
  });

  it("sync_customer_on_activity also calls merqo.upsert_customer, reusing its own resolved vendor_id/phone", () => {
    const activityFn = sql.slice(
      sql.indexOf("function loopkit.sync_customer_on_activity"),
    );
    expect(activityFn).toMatch(
      /where n\.nspname = 'merqo' and p\.proname = 'upsert_customer'/i,
    );
    expect(activityFn).toMatch(
      /perform merqo\.upsert_customer\(v_vendor_id, v_phone\);/i,
    );
  });
});
