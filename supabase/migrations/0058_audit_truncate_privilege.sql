-- TRUNCATE is separate from DELETE and is not constrained by RLS.
-- Preserve service reads/appends and owner maintenance.
REVOKE TRUNCATE ON loopkit.admin_audit FROM service_role;
