# hooks

## Purpose

Shared React hooks used across the vendor dashboard and setup UI.

## Contents

- `use-async-action.test.tsx` — vitest/jsdom tests for `useAsyncAction`: verifies `pending` resets after resolve, resets after a thrown rejection, and is `true` while the handler is in flight
- `use-async-action.ts` — `useAsyncAction()`: returns `{ pending, run }`, a `pending` flag that always resets in a `finally` block (including on throw), replacing hand-rolled `setBusy(true)/await/setBusy(false)` patterns that left buttons stuck-disabled on error

## Parent

[src](../README.md)
