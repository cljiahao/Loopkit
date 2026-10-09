# Loopkit component reuse cleanup specification

Date: 2026-10-10. Baseline: aeae2fa8e2e65a4de95297069adca2a7f028b4e4.

Fresh confirmation found shared progress-rendering switches, four reduced-motion readers (three snapshots and one subscribed preview), repeated form-card chrome/settings save lifecycle, chart bars/axes, customer search toolbars, and admin headers/stat markup. SetupForm and ServeCustomer remain the principal mixed-responsibility files. All changes stay in Loopkit; no schema, authorization, governance, or product copy decision is required. The tested shared UI commit is pinned to expose backward-compatible typography slots.

## Implementation and acceptance

1. Separate setup state/defaults/edit impact/preview inputs into a feature-local controller hook. Extract mechanic field groups while retaining a single native form, action selection (create/edit/replace/prep), mounted CSS-hidden wizard fields, field names, Pro restrictions, catalog IDs and type-change defaults. Existing setup contract tests must remain green.
2. Separate Counter controller/actions from presentation. Preserve one mutation per submit, scan routing, failed-action phone retention, pending-state behavior, stamp-only single undo, plant carryover, points offsets, reward timing, capability rotation and delivered recovery code. Existing Counter/action/security tests remain authoritative.
3. Share reduced-motion snapshot detection without adding live subscriptions to the three visuals; the preview retains its existing media-query subscription and cleanup.
4. Share only pure progress visualization between customer cards and preview. Preserve fixed preview height, seed differences, customer-only catalog actions, stamp-avatar resolution, wheel settle callback and scratch cover/controlled reveal behavior.
5. Share form-card styles and the two settings save handlers, guarding synchronous duplicate submissions and releasing pending state after rejection. Keep native GET filters/referral creation separate. Keep Telegram default-on and qkit default-off/Pro gating.
6. Share bars/axis rendering, preserving responsive 7/14-day Overview and 30-day Stats, prior-week tones, empty/max normalization and SGT date labels.
7. Compose existing shared StatTile inside admin adapter, preserving label-first order/current typography. Extract admin headers where four pages share them; no generic admin engine.
8. Share customer search toolbar across vendor/program/cohort paths; preserve query fields, accessible labels and GET semantics.
9. Shorten obsolete comments and refresh affected READMEs. Move duration constants into a lightweight time module. Keep deliberate phone-mask policies, currency output, useful adapters, metadata/profile upload rollback and server/client boundaries unchanged.

## Explicit exclusions

No mass folder moves, feature barrels mixing server/client modules, shadcn primitive edits, blanket memoization, live hardware claims, new authorization/RPC abstractions, public card recovery by phone, or forced shared UI changes. Different phone masks and money display contracts remain separate. Large authored SVG artwork stays domain-local. Any remaining product-policy choice is documented rather than silently changed.

## Verification

Add meaningful regression tests at shared contracts; run focused affected suites, pnpm check and full coverage with all four aggregate measures at least 80%. Scan the committed range for secrets and audit production dependencies before push. Use normal Git hooks; create PR and hold merge for independent review. A final sweep compares imports, contracts, documentation and scope against this specification. No production environment files are read.

The wheel settlement gate follows [React's conditional previous-render state pattern](https://react.dev/reference/react/useState#storing-information-from-previous-renders): it resets only when the spin state changes, before children render, and the settlement callback releases it. The regression test covers consecutive spins.
