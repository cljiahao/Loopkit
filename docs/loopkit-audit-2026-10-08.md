# Loopkit audit, 2026-10-08

Status: remediation prepared; SQL validation and deployment remain outstanding. No remote database changes, commits, pushes, or deployment.

## P1 security findings and prepared fixes

- `supabase/migrations/0020_qkit_earn_functions.sql:61`: anonymous SECURITY DEFINER `qkit_earn_commit` accepted caller-provided stamp counts and arbitrary engine state. Direct RPC calls bypassed the server action calculation; the configured program was not checked for ownership, active state, or stamp type. Prepared migration `0048_reward_rpc_boundaries.sql` derives the increment from stored card data, ignores compatibility count/state arguments, validates program ownership/type/active status, serializes claims per order, and rejects cross-phone replay.
- `supabase/migrations/0041_loopkit_birthday_bonus.sql:49`: `_add_stamp_unchecked` has no ownership check and no PUBLIC execution revocation. PostgreSQL's default PUBLIC execute allows bypassing the guarded `add_stamp` wrapper where deployed grants match migrations. Migration0048 revokes execution from PUBLIC, anon, and authenticated; owner-internal calls remain possible.
- `supabase/migrations/0040_loopkit_referral_hosts.sql:245`: anonymous `apply_referral_credit` accepted caller-computed engine state for a pending host credit. Migration0048 restricts this final write to service_role; `src/features/card-check/api/actions.ts:92` now obtains a service client only inside the trusted server computation.
- `supabase/migrations/0019_qkit_earn.sql:15` and `0040_loopkit_referral_hosts.sql:26`: write policies only checked the new row's vendor id, permitting a vendor to reference another vendor's program. Migration0048 additionally requires `owns_program(program_id)` in both policies. Existing invalid rows are rejected by ownership joins in earn commit, referral enrollment, and referral completion. A data audit should still precede deployment.

## P2 fixed input error

`src/app/dashboard/referrals/actions.ts:48` now handles an invalid or overlong label as a returned form error, rather than throwing a Zod exception. Regression asserts no insert happens.

## Remaining review items

- P2 card truncation, src/lib/cards.ts: prepared complete keyset pagination for listCards and activeCardCountsByProgram. Program IDs are deduplicated and batched at 100. Later-page errors throw; partial counts/lists are never returned as complete. Focused regression/check validation remains pending for this follow-up.
- Upstream dependency: earn authorization trusts merqo.kit_events. Merqo's emit_metric permission boundary is being reviewed separately; loopkit's defenses do not establish that upstream event authenticity by themselves.
- Six inherited, unused Qkit utility exports were removed after source-reference searches found no callers; their obsolete tests were removed with them. No framework entrypoint or externally callable RPC was deleted on import evidence alone.

## Verification and rollout

- Broad source coverage passed with two workers: 1,353 tests; statements 83.56%, branches 80.83%, functions 80.09%, lines 84.45%. Thresholds enforce 80% for each metric. Production source scope was retained; test-file exclusions include TSX tests. Vite dotenv loading is explicitly disabled with envDir:false.
- Local targeted tests: 2 files and 28 tests passed, including referral success/failure, service-client use, and form validation. pnpm check passed (format, lint, types).
- Rollback-only SQL regression file: `supabase/tests/reward-rpc.test.sql`, covering client execute privileges, forged counts/state, replay, cross-phone replay, and cross-vendor writes.
- SQL tests are not run: local Docker daemon is unavailable and psql is not installed. Migration is NOT applied. Validate in a disposable database containing both loopkit and merqo migrations, including the shared event table.
- The original earn RPC arguments/results are unchanged; `src/lib/types.ts` documents that count/state arguments are retained for compatibility. Live type regeneration was not attempted because no approved local database is running.
- Manual SQL review: confirm signature/grants after0048, exercise concurrent same-order/different-order claims, confirm denied cross-vendor config/referral writes, verify birthday-trigger behavior and trusted referral completion, then roll back fixtures. Deploy the service-client application caller before restricting referral RPC execution to avoid a transient referral failure.

## Reward voucher and birthday review

- Migration0048 also fixes missing vouchers on Qkit-earned and referral-earned stamp thresholds. Qkit awards one stamp per completed order up to the configured cap; distinct referral guests each award exactly one uncapped stamp. Voucher text and expiry use the program snapshot.
- Private voucher/expiry helpers preserve the existing mutation contract while removing session ownership checks from trusted internal calls. PUBLIC, anon and authenticated cannot execute these helpers. Public wrappers retain ownership checks. This permits the anonymous, constrained earn path and birthday trigger to work without weakening the public voucher boundary.
- Card locks serialize count/expiry changes. Expiry marks vouchers and returns the newly expired count; callers deduct its stamp value once. Qkit and referral paths grant their own crossing before emitting the stamp event; birthday recursion handles its separate increment. The shared stamp helper calculates its own crossing from captured pre-trigger values and rereads the final card, preventing a stale birthday result. This is static reasoning, not a concurrency test result.
- The rollback-only SQL suite now contains 39 assertions, including helper ACLs, threshold vouchers, replay/cap behavior, expiry replacement, birthday-trigger interaction, referral deduplication and invalid program/event rejection. All SQL remains UNRUN and UNAPPLIED. Final application typecheck passed after the helper type declarations.
- Historical counts previously written without vouchers are not blindly backfilled: older caller-controlled counts may be untrustworthy. Such records need a provenance-aware data review. The pending upstream Merqo event-permission fix is separately required.

## Card pagination follow-up

Scoped reads use the existing RLS-bound client throughout. Stable tie-breaks
prevent same-timestamp page loss; empty-page termination handles smaller server
caps. Active-count ID ordering avoids changing activity timestamps in the cursor.
One cutoff is reused across all count pages and bounded program batches. No SQL
or grants change. Concurrent writes may change a multi-query result; this does
not claim a transactionally consistent export.

New standalone cards.pagination.test.ts does not overlap the page-component
tests that mock cards.ts. Inventory decision: retain cards.ts and its regression
as the customer-list/default-program/count read boundary; no file deletion is
justified by this change. Full remaining-file necessity review is separate.

## Non-stamp referral compare-and-swap

- P2 stale-state overwrite is repaired in prepared migration0049 and `src/features/card-check/api/referral-credit.ts`. A service-only snapshot reads the current owned active program/card; the checked commit locks host, program, credit and card and compares the expected snapshot before consuming the reservation. The legacy arbitrary-state commit loses its service-role execute grant.
- Server retries are bounded to three attempts, retaining the same random roll and timestamp while recalculating from refreshed state. Already-completed credits return success without events or writes. A repeated referral join can recover a still-pending reservation without incrementing guest count twice. Host/program/credit locks protect that retry even if the program type changes.
- Nine focused helper tests model competing commits, recomputation, idempotence, missing state, contention and transport/response failures. Twenty rollback-only SQL assertions cover actual stale-snapshot rejection and pending-credit preservation, plus repeated joins and changed program type. Mocked concurrent calls validate retry orchestration; they do not establish PostgreSQL runtime concurrency. Tests are prepared; execution evidence is recorded by the coordinating audit after application.
- Independent static review found and corrected an unlocked pending-credit retry and stale host identity before final review. No remaining static blocker was identified, but0049 is UNAPPLIED and database tests remain UNRUN. The earlier source coverage gate predates the new helper and pagination changes and must be rerun.
- Tracked-file inventory records role, necessity and explicit reviewed-versus-pending status. Inventory alone is not a claim that every file received a deep security review.

## Capability and cohort continuation (2026-10-09)

Migration 0055 and the public card actions now require an existing card's vendor/phone/token possession before returning card or voucher credentials or modifying birthday/catalog/expired-cycle state. New enrollment returns only credentials inserted by that enrollment. Vendor-assisted recovery verifies owning vendor authorization, rotates customer card and active voucher credentials, and preserves progress. Starting a fresh expired cycle is a separate explicit customer operation. The server stores a validated opaque capability in an HttpOnly vendor-scoped cookie. An explicit “Forget saved card on this browser” action clears only that cookie, allowing a different customer to enroll on a shared browser without changing database records.

Migration 0056 closes the separate Qkit earn path: a completed order authorizes one stamp; existing card access also requires possession. Legacy lookup/commit grants are revoked, including service-role direct execution; the guarded definer wrapper captures the fresh insert's ID/token and rejects a conflict or mismatched commit result. Independent review found a new-enrollment race and reciprocal-referral lock inversion; the final staged SQL addresses them through inserted-credential checks and a vendor-scoped join lock taken before customer/card locks. These are static review conclusions, not executed database concurrency results.

Overview links now target exact gone-quiet, one-away and two-away card cohorts using the same rules and data shape that produced their counts. Destination rows remain per card/program, including two matching cards belonging to one phone. They do not substitute the merged “reward ready” or “not seen 30d+” customer segments. Cohort/program/search parameters persist, and explicit segment/sort queries bypass the single-program redirect. VendorCustomerList was extracted to a reusable component so the Next page exports only its supported runtime entry.

The refreshed source ledger contains 223 current production TS/TSX/CSS files. Five new modules were reviewed in full with their purpose and consumers; changed capability, recovery, type-mirror and cohort boundaries were reread. The earlier full-source reads remain distinct from metadata classification of every repository path. Focused cohort regressions pass 23 tests; customer switching, proof scope and page extraction pass 34 tests. Full coverage, lint/types and an isolated build after this last continuation are recorded by the coordinating run. The earlier 1,353-test coverage checkpoint does not certify the final state.

SQL remains unapplied/unrun while Docker's Linux engine is unavailable. No phone ownership verification or SMS provider was introduced; vendor recovery relies on the vendor verifying the customer. Browser end-to-end behavior, deployment rollout and live integrations remain separate checks. No commit, push, deployment, production database mutation or secret-file read is claimed.
