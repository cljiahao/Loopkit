# hooks

## Purpose

Shared React hooks used across the vendor dashboard and setup UI.

## Contents

- `use-async-action.test.tsx` — vitest/jsdom tests for `useAsyncAction`: verifies `pending` resets after resolve, resets after a thrown rejection, and is `true` while the handler is in flight
- `use-async-action.ts` — `useAsyncAction()`: returns `{ pending, run }`, a `pending` flag that always resets in a `finally` block (including on throw), replacing hand-rolled `setBusy(true)/await/setBusy(false)` patterns that left buttons stuck-disabled on error; also exports `navigatingAway()`, a promise that never resolves — `await` it at the end of a success-and-navigate branch so `run`'s `finally` doesn't flip `pending` back to `false` (re-enabling the submit button) while the old page is still showing mid-`router.push`/`router.replace` transition

## Parent

[src](../README.md)
