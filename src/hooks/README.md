# hooks

## Purpose

Shared React hooks used across the vendor dashboard and setup UI.

## Contents

- `use-async-action.test.tsx` — vitest/jsdom tests for `useAsyncAction`: verifies `pending` resets after resolve, resets after a thrown rejection, is `true` while the handler is in flight, and that `error`/`reset()` behave correctly
- `use-async-action.ts` — thin adapter over `@merqo/ui`'s `useAsyncAction`: binds the shared hook's action to `(fn) => fn()` so `run(async () => { … })` keeps its original per-call-dynamic-closure shape — every existing call site works unchanged. Returns `{ pending, error, run, reset }`; also re-exports `@merqo/ui`'s `navigatingAway()`, a promise that never resolves — `await` it at the end of a success-and-navigate branch so `run`'s `finally` doesn't flip `pending` back to `false` while the old page is still showing mid-`router.push`/`router.replace` transition

## Parent

[src](../README.md)
