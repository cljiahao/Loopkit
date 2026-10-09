# card-check

Customer action regressions now live beside the implementation in
[`src/features/card-check/api/actions.test.ts`](../../../src/features/card-check/api/actions.test.ts).
The suite covers saved customer proof, the capability-aware `customer_join`
RPC, fresh enrollment, generic recovery failures, card projections and
regeneration. The former duplicate `test/features/card-check/actions.test.ts`
was consolidated into that suite.

[features](../README.md)
