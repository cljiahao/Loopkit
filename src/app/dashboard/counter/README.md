# counter

## Purpose

The scan-first "serve a customer at the counter" view at `/dashboard/counter?p=<id>&phone=<optional>`. A large scan target is the hero; manual phone entry collapses into a fallback; the active card starts empty; a vendor can add a brand-new customer or print a shop join poster without leaving the page.

## Contents

- `page.tsx` — `CounterPage` server component. Requires a vendor; loads programs and redirects to `/dashboard` when there are none. With no `?p=`, it fetches `activeCardCountsByProgram` and redirects to `pickDefaultCounterProgram`'s pick (the busiest active program), or `/dashboard` when nothing is active. Otherwise it resolves the program from `?p=` (redirect to `/dashboard` if it is not one of the vendor's), builds the vendor-wide shop-join link (`<origin>/c?v=<vendorId>`) plus its QR, reads the stall name, computes `getEntitlement(await isPro())` and passes its `showBranding` down as `ServeCustomer`'s `showBranding` prop, mounts `RememberProgram`, renders the head row (program name + badge + `describeProgram` + a `ProgramSwitcher` chip when the vendor runs more than one program), and renders `ServeCustomer` keyed on the program id. Wrapper is `mx-auto max-w-4xl` (wider than the old `max-w-2xl` to fit the two-column serve layout), nested inside `../layout.tsx`'s shared `<main>`. Derives `redemption_mode` off the program's own `config` and passes it as `ServeCustomer`'s `pointsRedemptionMode`.
- `counter-view.ts` — `pickDefaultCounterProgram(programs, activeCountById)`: pure helper picking the program id with the most active cards (ties to the earlier entry, first program when all counts are zero or missing, `null` when empty).
- `counter-view.test.ts` — unit tests for `pickDefaultCounterProgram`.
- `remember-program.tsx` — client `RememberProgram`: renders nothing; on mount and whenever `id` changes, writes `localStorage["loopkit:last-counter-program"]` (swallows a throwing `setItem`). Sub-plan 3's "Serve a customer" CTA reads this key.
- `remember-program.dom.test.tsx` — jsdom tests: writes on mount, updates on `id` change, does not crash when storage throws.
- `scan-hero.tsx` — client `ScanHero`: the Counter's primary action, a thin wrapper around `ScanButton` `variant="hero"` with the label "Scan the customer's card" and the sub "Camera opens when you tap". All decode/token-resolve logic stays in `ScanButton`.
- `scan-hero.dom.test.tsx` — jsdom tests: renders the label and sub copy as a button, carries the cornered dashed frame chrome.
- `new-customer-panel.tsx` — client `NewCustomerPanel`: a phone input + "Create card and first stamp" button that calls `stampAction` (`add_stamp` both creates the card and lands the first stamp), toasts, fires `onCreated(phone, card)`, and clears the input. Light client-side length check only; the server action is the real validator.
- `new-customer-panel.dom.test.tsx` — jsdom tests: `stampAction` gets `program_id` + `phone`, `onCreated` fires and the input clears on success, a failed action shows an error toast and does not fire `onCreated`, an obviously-short number never reaches the server.
- `counter-actions.tsx` — client `CounterActions`: the "New customer" / "Shop join QR" toggle row under the scan hero. One panel open at a time (`aria-expanded`), revealing `NewCustomerPanel` or (`ShopJoinPoster` + a print note); creating a customer closes the row. Takes an optional `showBranding` prop (default `true`), threaded straight into `ShopJoinPoster`.
- `shop-join-poster.tsx` — server `ShopJoinPoster` + client `PrintPosterButton` (`print-poster-button.tsx`): a printable "Join our loyalty card" poster over the vendor-wide join link. The poster surface is forced `bg-white text-black` so a dark-mode vendor still prints a white sheet; a scoped `@media print` block hides the rest of the page so only `#shop-join-poster` prints. An optional `showBranding` prop (default `true`) shows or hides the "via LoopKit" line — `false` for a Pro vendor, per `Entitlement.showBranding`.
- `shop-join-poster.dom.test.tsx` — jsdom tests: renders the shop name, join CTA copy, and the QR; the poster element carries `bg-white`, not `bg-card`; shows the "via LoopKit" line by default and hides it when `showBranding={false}`.
- `served-strip.tsx` — `ServedStrip` + `ServedEntry` type: the "Served just now" list. Each row shows a masked phone and a note (`"6 to 7 of 8"` for a stamp, `"reward redeemed, ..."` for a redeem); an "Undo" button appears only on an `undoable` entry. Renders nothing when empty.
- `served-strip.dom.test.tsx` — jsdom tests: exactly one Undo button for a mixed list, clicking it calls `onUndo` with that entry, nothing rendered when empty.
- `use-served-strip.ts` — `useServedStrip()` hook owning the served list: `push(phone, note, undoable)` prepends (cap 5) and clears every prior entry's Undo; `markDone(id)` clears one. Keeps this state plumbing out of `serve-customer.tsx`.
- `serve-result.ts` — the `ServeResult` union (stamp / lucky / plant / chance) plus its `PlantView` / `ChanceView` shapes, lifted verbatim from `serve-customer.tsx` so `serve-customer` and `active-card` share one definition.
- `active-card.tsx` — client `ActiveCard`: the Counter's right column. An explicit empty state (`data-state="empty"`) until a customer loads, then the per-mechanic result block (`StampBlock` / lucky / `PlantBlock` / `ChanceBlock`) and the regenerate-card dialog. Every block is the original `serve-customer.tsx` markup, moved not rewritten; `RedemptionControl` and `luckyResultMessage` moved here with it.
- `counter-page.dom.test.tsx` — jsdom tests: with `?p=` set, `ServeCustomer` gets the program + shop-join props (including `showBranding: true` for a free vendor, `false` for a Pro one) and `RememberProgram` gets the program id; a missing `?p=` redirects to the busiest program; an unknown `?p=` redirects to `/dashboard`.

## Parent

[dashboard](../README.md)
