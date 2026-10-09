# earn

Customer-facing stamp claims reached through a completed qkit order link.

- `actions.ts` validates the order UUID, phone, name and optional saved token. It resolves the order's vendor through a service-only RPC, then invokes `customer_qkit_earn_claim`. Existing cards and retries require a current card token scoped to that vendor and phone. A first enrollment returns only a freshly inserted credential; database conflicts require recovery. The action saves proof in the HttpOnly vendor cookie and returns only progress to the form.
- `actions.test.ts` covers enrollment, saved and manual proof, denied recovery, malformed responses, transport failures and cookie failures.
- `earn-form.tsx` renders phone, optional name and optional saved card token inputs. Lost cards use vendor-assisted recovery. Successful claims show stamp progress and reward copy.
- `earn-form.dom.test.tsx` covers rendering, submission, progress and visible errors.
- `page.tsx` reads the order search parameter and renders the form or missing-reference copy.

Migration `0056` closes direct access to the legacy phone-only lookup and commit functions. The guarded SQL wrapper preserves persisted stamp limits and idempotency. Database authorization and conflict regressions are in `supabase/tests/earn-customer-capability.test.sql`; these require a disposable local database.

[app](../README.md)
