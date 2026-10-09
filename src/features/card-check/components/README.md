# Card-check components

- check-form.tsx submits vendor, phone, optional saved card code and referral code. It renders generic recovery guidance without revealing whether a phone has a card. A successful check stores the opaque capability in an HttpOnly cookie and renders authorized cards.
- program-card-status.tsx renders progress, card and voucher QR codes, and a saveable card code. Fresh-cycle reset is available only for an expired card; lost credentials require the shop. Retired-card notices are optional local preferences.
- points-catalog-picker.tsx submits vendor and program scope; the server reads the capability cookie and the database checks ownership and balance. Pending state always clears after failures.
- birthday-field.tsx submits an optional birthday through the proof-checked action.

Component tests verify rendering, form payloads, retry states and the expired-cycle reset boundary. Capability cookie and direct SQL authorization regressions live in src/lib/customer-proof.test.ts and supabase/tests/customer-capability.test.sql.

[Parent](../README.md)
