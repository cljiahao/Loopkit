-- 0039 — admin_audit immutability: RLS (0003) already blocks authenticated/
-- anon from writing loopkit.admin_audit at all, but nothing stopped the
-- service-role client itself from UPDATE/DELETE — RLS doesn't apply to it,
-- and `grant all on ... to service_role` (0003) included both. The app only
-- ever INSERTs into admin_audit (recordAudit, src/lib/admin-audit.ts) —
-- never UPDATEs or DELETEs it — so revoking those two privileges from
-- service_role costs nothing functionally and closes a real tampering gap:
-- today, anyone holding the service-role key could edit or erase the audit
-- trail directly. SELECT and INSERT stay granted.

revoke update, delete on loopkit.admin_audit from service_role;
