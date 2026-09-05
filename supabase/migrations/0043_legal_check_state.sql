-- supabase/migrations/0043_legal_check_state.sql
-- Local TTL cache for "has this email's legal-doc acceptance been confirmed
-- current recently?". loopkit does not own the acceptance record — merqo does
-- (merqo.legal_acceptances) — so confirming currency means an HTTP call to
-- merqo's GET /api/merqo/legal-status. That check runs on every gated
-- dashboard render, so the result is cached here for a short TTL, mirroring
-- merqo's own vendor_sync_state throttle table (merqo migration 0023).
--
-- Written and read only by the service-role client (src/lib/legal-gate.ts);
-- never reached from a browser path, so it follows the same RLS-on /
-- no-policy / explicit-service_role-grant shape as telegram_link_tokens
-- (0036, before it was dropped by 0037) and pricing's writer restriction —
-- a new table needs its own service_role grant, there is no blanket GRANT.

CREATE TABLE loopkit.legal_check_state (
  email      TEXT        PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_current BOOLEAN     NOT NULL
);

ALTER TABLE loopkit.legal_check_state ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role client touches it (RLS on + no policy =
-- deny all direct anon/authenticated access).

GRANT SELECT, INSERT, UPDATE ON loopkit.legal_check_state TO service_role;
