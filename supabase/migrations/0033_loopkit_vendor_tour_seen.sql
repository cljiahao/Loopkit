-- Remember whether a vendor has seen the dashboard onboarding tour, so it
-- auto-runs only on first login (the floating "?" replay button ignores
-- this). Stored server-side (not localStorage) so it's user-scoped and
-- consistent across devices/browsers. Null = never seen. RLS's existing
-- vendors_own policy (0017_loopkit_vendor_profile.sql) already lets a
-- vendor read/update its own row via vendor_id = auth.uid(), so no policy
-- change is needed. Matches qkit's 0023_vendor_tour_seen.sql, adapted to
-- this table's vendor_id primary key (not id).
ALTER TABLE loopkit.vendors
  ADD COLUMN IF NOT EXISTS tour_seen_at TIMESTAMPTZ;
