-- supabase/migrations/0045_loopkit_reward_cost.sql
-- Vendor-dashboard redesign, sub-plan 2: one reward cost per stamp program,
-- the vendor's own estimate of the reward item's COGS in SGD cents. Used by
-- the Overview cost panel (rewards_redeemed_this_month * reward_cost_cents).
-- Nullable: a program with no estimate set is shown as "cost not set", never
-- as $0. programs_own (migration 0001, FOR ALL) already covers the column,
-- so no policy change.

alter table loopkit.programs
  add column if not exists reward_cost_cents integer
    check (reward_cost_cents is null or reward_cost_cents >= 0);
