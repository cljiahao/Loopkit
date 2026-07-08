-- supabase/migrations/0010_loopkit_chance_types.sql
-- Widen programs.type to admit the two chance-based templates (wheel, scratch).
-- They share one weighted-outcome strategy in TypeScript; no new tables/RPCs —
-- record_visit (0005) already persists arbitrary per-type state.
alter table loopkit.programs drop constraint if exists programs_type_check;
alter table loopkit.programs
  add constraint programs_type_check
  check (type in ('stamp','lucky','plant','wheel','scratch'));
