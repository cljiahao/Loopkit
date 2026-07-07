-- supabase/migrations/0004_loopkit_engine.sql
-- v2 engine, phase 1: generalize the schema so a program has a type + a config
-- blob, a card carries a per-type state blob, and events carry a payload. Purely
-- additive + a backfill; existing stamp programs keep working unchanged. Strategy
-- logic lives in TypeScript (src/lib/engine), so no function changes here.

alter table loopkit.programs
  add column type text not null default 'stamp'
    check (type in ('stamp','lucky','plant')),
  add column config jsonb not null default '{}'::jsonb;

alter table loopkit.cards
  add column state jsonb not null default '{}'::jsonb,
  add column last_event_at timestamptz;

alter table loopkit.stamp_events
  drop constraint if exists stamp_events_kind_check;
alter table loopkit.stamp_events
  add constraint stamp_events_kind_check
    check (kind in ('stamp','redeem','visit','win'));
alter table loopkit.stamp_events
  add column if not exists payload jsonb;

-- Backfill existing rows so reads through the engine work immediately. Idempotent:
-- only touches rows still at the default empty blob.
update loopkit.programs
  set config = jsonb_build_object('stamps_required', stamps_required,
    'reward_text', reward_text)
  where config = '{}'::jsonb;

update loopkit.cards
  set state = jsonb_build_object('stamp_count', stamp_count),
      last_event_at = coalesce(updated_at, created_at)
  where state = '{}'::jsonb;
