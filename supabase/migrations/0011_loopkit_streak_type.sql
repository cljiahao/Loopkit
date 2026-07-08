-- supabase/migrations/0011_loopkit_streak_type.sql
-- Widen programs.type to admit the streak template. No new tables/RPCs —
-- record_visit (0005) already persists arbitrary per-type state.
alter table loopkit.programs drop constraint if exists programs_type_check;
alter table loopkit.programs
  add constraint programs_type_check
  check (type in ('stamp','lucky','plant','wheel','scratch','streak'));
