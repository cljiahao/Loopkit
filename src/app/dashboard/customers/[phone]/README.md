# customers/[phone]

## Purpose

Day-2 ops gap fix: a vendor's only correction tool used to be "Regenerate
card" — a full reset to zero that also invalidates the customer's QR. This
route is one customer's detail view: every card they hold across the
vendor's own programs, a targeted manual stamp adjustment with a required
reason, and their full activity history in one place.

## Contents

- `page.tsx` — `CustomerDetailPage`: resolves the `[phone]` route param
  (URL-decoded, then re-validated through `normalizePhone` — `notFound()`
  on anything malformed), loads `getCustomerDetail` (`@/lib/customers`) and
  the customer's own activity via `listActivity`'s new `phone` filter
  (`@/lib/activity`). Renders one card per program the customer holds
  (name, type badge, stamp/reward counts) with `AdjustStampForm` shown only
  for `type === "stamp"` programs — Growth/Points/Chance cards use the
  separate jsonb `state` engine and have no adjustment tool yet. `notFound()`
  when the customer has neither a name on file nor any card.
- `customer-detail-page.dom.test.tsx` — jsdom test asserting the name/phone
  fallback, that `AdjustStampForm` only renders for stamp-type cards, and
  the two `notFound()` paths (invalid phone param, unknown customer).
- `adjust-stamp-form.tsx` — `AdjustStampForm({programId, phone})`: collapsed
  behind an "Adjust stamps" trigger; opened, it's a `±` delta + required
  reason form calling `adjustStampAction` (`@/app/dashboard/actions`), via
  `loopkit.adjust_stamp` (`supabase/migrations/0042_loopkit_adjust_stamp.sql`).
  Clamped at 0, never creates a card, logged as its own `stamp_events.kind`
  ('adjust') distinct from a real stamp — surfaced in the activity feed with
  its reason and a `Pencil` icon instead of the stamp/reward icons. Stays
  free-tier, not Pro-gated — the founder's own call: Pro-gating belongs on
  customization features (logos, card designs — still unbuilt), not on
  fixing a mistake.
- `adjust-stamp-form.dom.test.tsx` — jsdom test covering the
  collapsed/expanded states, the submitted `FormData` shape, and the
  success/error toast paths.

## Parent

[customers](../README.md)
