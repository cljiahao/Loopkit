# components

## Purpose

Client-side card-check UI.

## Contents

- `check-form.tsx` — `CheckForm`: phone-entry form using `useActionState` +
  `checkStatusAction`, renders a `ProgramCardStatus` per returned card, and
  shows a `role="alert"` message on an `"error"`/`"none"` result. Accepts
  an optional `referralCode` prop (`src/app/c/page.tsx`'s `?ref=` query
  param) rendered as a hidden `ref` form field only when present — an
  unchanged, ref-less submit behaves exactly as before. On a
  `"found"` result the form collapses to a compact "Showing +65… / Not
  you?" summary so the card status (and the QR the customer needs to show
  the shop) isn't pushed below a form they've already filled in; "Not
  you?" reopens it, and it re-collapses once a fresh result comes back
  (not immediately on submit, so it stays open through the pending
  "Checking…" state) — done by comparing the current action state against
  the last-seen one during render, React's documented alternative to a
  `setState`-in-`useEffect` for resetting state on a change. Renders
  `BirthdayField` once, below the card list, on a `"found"` result.
- `check-form.dom.test.tsx` — jsdom tests for `CheckForm`: renders the phone
  input and hidden vendor field, submits the form and renders one
  `ProgramCardStatus` per returned card, shows the `role="alert"` message
  for both the error and not-found results, and renders a hidden `ref`
  field only when a `referralCode` prop is given
- `program-card-status.tsx` — `ProgramCardStatus`: renders one program's
  progress visual by `view.kind`/`view.variant` (`Plant`/`Cup`,
  `FlameLayers`, `Wheel`/`ScratchCard`, `StampDots`/`PointsBar`), and owns
  its own dialog state for card regeneration (`regenerateCardAction`) and a
  one-time retired-card notice (auto-opens once per replaced card, tracked
  in `localStorage`); renders `LuckyBox` for a `kind: "lucky"` view instead
  of falling through to the generic stamp-dots view; its outer container is
  now `@/components/card-shell.tsx`'s `CardShell` (idle holographic sheen +
  pointer-tilt), replacing a plain `<div>`.
- `program-card-status.dom.test.tsx` — jsdom tests for `ProgramCardStatus`:
  verifies `PointsBar` vs `StampDots` renders per `view.variant` on a
  `"dots"` view, and `Cup` vs `Plant` renders per `view.variant` on a
  `"plant"` view
- `birthday-field.tsx` — `BirthdayField({vendorId, phone})`: optional,
  self-entered birthday (plain native `<select>`s for month/day, not the
  shadcn `Select` — Radix's pointer-event/`scrollIntoView` needs have no
  existing jsdom-test precedent in this repo, and a native select is fine
  UX here) calling `setCustomerBirthdayAction` via `useTransition`; shows a
  "Birthday saved." confirmation and hides the form once saved, never says
  whether the vendor's own bonus toggle is actually on
- `birthday-field.dom.test.tsx` — jsdom tests for `BirthdayField`: Save
  stays disabled until both month and day are picked, submits vendor/phone/
  month/day as `FormData`, shows the saved confirmation and removes the
  form on success, and stays on the form with an error toast on failure

## Parent

[card-check](../README.md)
