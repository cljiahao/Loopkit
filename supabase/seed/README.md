# Demo seed

## Purpose

`loopkit-demo.sql` creates one Kopi Corner stamp program with synthetic cards,
reward vouchers and recent activity for local exploration. It is not a migration
or an authorization/concurrency test.

Use a disposable local database after applying the full migration chain, and a
fresh dedicated auth user. Replace `<YOUR_AUTH_USER_ID>` with that user's ID. The
seed refuses a vendor with any existing program, including a second run, and
never deletes programs or customer progress. Card IDs are generated per run so
independent demo vendors cannot collide. Do not run it against hosted customer
data. The repaired seed has not been executed because Docker's Linux engine is
unavailable.

## Parent

[supabase](../README.md)
