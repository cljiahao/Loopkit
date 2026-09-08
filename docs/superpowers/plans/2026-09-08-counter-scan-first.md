# Counter scan-first Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/dashboard/counter` scan-first: a large scan target is the hero, manual phone entry collapses into a fallback, the active card starts empty, and the vendor can add a brand-new customer or print a shop join poster without leaving the page.

**Architecture:** `counter/page.tsx` stays a thin server component (resolve program, render). `serve-customer.tsx` is recomposed: the scan target moves to the top as the primary action, the phone form drops into a `<details>`, and the result panel renders an explicit empty state until a customer loads. New sibling components handle "new customer" and "shop join QR". No loyalty-engine change: `stampAction`, `recordVisitAction`, `lookupAction`, `redeemPlantAction`, `regenerateCardAction`, `adjustStampAction` and the `ServeResult` union are all reused as-is. Undo is `adjustStampAction` with `delta: -1`.

**Tech Stack:** Next.js 16, React 19 client components, `@zxing/browser` (already a dep, via `ScanButton`), `qrcode` (already a dep, via `qrSvg`), Tailwind v4, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-09-08-vendor-dashboard-redesign-design.md` (sub-plan 4 of 5)

**Depends on:** nothing. Independent of sub-plans 1, 2, 3.

**Visual source of truth:** the approved mockup, Counter screen (`<div class="screen" data-name="counter">`, lines ~738-850). Copy structure, wording, hierarchy. Style with loopkit `globals.css` tokens and existing idioms.

## Global Constraints

- Pin exact dependency versions. This plan adds none.
- **No em dashes** in user-facing copy or code comments. The current `serve-customer.tsx` and `counter/page.tsx` are full of them (and of the literal `"—"` string): every line you touch, convert. Empty-metric placeholder is `"--"` (two hyphens) or real words, never `"—"`.
- TypeScript strict.
- Validate user input with Zod at the boundary. The new-customer phone goes through the existing `stampAction` (which already `normalizePhone`s and validates); the client does a light format check only.
- Authorization in RLS. All actions already `requireVendor` + RLS-scope. No service-role.
- No `isPro()` checks (ungated).
- CI gate: changed-line coverage >= 80%. Client components: `*.dom.test.tsx` with RTL, mock the server actions (`vi.mock("@/app/dashboard/actions", ...)`).
- Every PR touches `CHANGELOG.md` and keeps every changed folder's `README.md` current in the same commit, including a root `README.md` running-narrative sentence.

## Decisions locked for this plan

- **Shop join QR is vendor-wide** (`/c?v=<vendorId>`), the same target `ShopQrBlock` encodes today. Program-specific join links (`&p=<programId>`) are deferred: `vendor_join` deliberately enrolls a customer into _every_ active program at once, and changing that semantics touches the public join + referral paths, which is out of scope here. The parent spec is updated to match. The Counter poster is a nicer print layout over the same link.
- **Undo covers the last stamp only.** After a successful `stampAction`, a one-level "Undo" calls `adjustStampAction({ delta: -1, reason: "undo" })`. Undo is cleared on the next serve action or on leaving the page. Redemption and non-stamp plays are not undoable from the strip (the deeper tool is `customers/[phone]/adjust-stamp-form`); the strip shows them without an Undo button.
- **Last-used program** is written to `localStorage["loopkit:last-counter-program"]` by the Counter page on load (sub-plan 3's `ServeCta` reads it). First-ever Counter visit with no `p` param redirects to the program with the most active cards.
- **Active card empty state**: `serve-customer.tsx`'s `result` state already starts `null`. The empty state is a real rendered panel (mockup `data-state="empty"`), not a blank space.

## File Structure

- `src/app/dashboard/counter/counter-view.ts` (create) - `pickDefaultCounterProgram` pure helper.
- `src/app/dashboard/counter/counter-view.test.ts` (create).
- `src/app/dashboard/counter/page.tsx` (modify) - resolve default program on missing `p`, render the poster data, mount `RememberProgram`.
- `src/app/dashboard/counter/remember-program.tsx` (create) - `"use client"`, writes the `localStorage` key on mount. + test.
- `src/app/dashboard/serve-customer.tsx` (modify) - recompose scan-first; add the empty state, the counter-actions row, the served strip with Undo.
- `src/app/dashboard/counter/scan-hero.tsx` (create) - the big scan target. Wraps `ScanButton` behaviour with the mockup's frame styling. + test.
- `src/app/dashboard/counter/new-customer-panel.tsx` (create) - phone + "Create card and first stamp" -> `stampAction`. + test.
- `src/app/dashboard/counter/shop-join-poster.tsx` (create) - printable poster over `/c?v=<vendorId>`. + test.
- `src/app/dashboard/counter/served-strip.tsx` (create) - "Served just now" list with Undo. + test.
- `src/app/dashboard/serve-customer.dom.test.tsx` (create if absent; the current tree has no direct test for `serve-customer.tsx` - `counter/counter-page.dom.test.tsx` exists) - cover the recomposed layout.
- `CHANGELOG.md`, `src/app/dashboard/README.md`, `src/app/dashboard/counter/README.md`, root `README.md` (modify).

---

### Task 1: `pickDefaultCounterProgram`

**Files:** `src/app/dashboard/counter/counter-view.ts`, `counter-view.test.ts`

**Interfaces:**

- Produces `pickDefaultCounterProgram(programs: { id: string }[], activeCountById: Record<string, number>): string | null` - the id with the highest active count; ties break to the earlier entry in `programs`; when every count is 0 or missing, the first program's id; `null` when `programs` is empty.

- [ ] **Step 1: Failing tests**

```ts
import { pickDefaultCounterProgram } from "./counter-view";

describe("pickDefaultCounterProgram", () => {
  const progs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("picks the highest active count", () => {
    expect(pickDefaultCounterProgram(progs, { a: 2, b: 9, c: 4 })).toBe("b");
  });
  it("breaks ties toward the earlier program", () => {
    expect(pickDefaultCounterProgram(progs, { a: 5, b: 5, c: 1 })).toBe("a");
  });
  it("falls back to the first program when all counts are zero or missing", () => {
    expect(pickDefaultCounterProgram(progs, {})).toBe("a");
  });
  it("returns null for no programs", () => {
    expect(pickDefaultCounterProgram([], {})).toBeNull();
  });
});
```

- [ ] **Step 2-4: fail, implement, pass.**

```ts
export function pickDefaultCounterProgram(
  programs: { id: string }[],
  activeCountById: Record<string, number>,
): string | null {
  if (programs.length === 0) return null;
  let best = programs[0].id;
  let bestCount = activeCountById[best] ?? 0;
  for (const p of programs) {
    const count = activeCountById[p.id] ?? 0;
    if (count > bestCount) {
      best = p.id;
      bestCount = count;
    }
  }
  return best;
}
```

- [ ] **Step 5: Commit** - `git commit -m "feat(counter): pickDefaultCounterProgram helper"`

---

### Task 2: `remember-program.tsx`

**Files:** `src/app/dashboard/counter/remember-program.tsx`, `remember-program.dom.test.tsx`

**Interfaces:**

- `<RememberProgram id={string} />` - `"use client"`, renders nothing (`return null`). On mount and whenever `id` changes, `try { localStorage.setItem("loopkit:last-counter-program", id); } catch {}`.

- [ ] **Step 1: Failing test** (jsdom) - render `<RememberProgram id="p7" />`, assert `localStorage.getItem("loopkit:last-counter-program") === "p7"`; re-render with `id="p9"` -> value updates; stub `setItem` to throw -> no crash.
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Commit** - `git commit -m "feat(counter): remember the last-used program per device"`

---

### Task 3: `scan-hero.tsx`

**Files:** `src/app/dashboard/counter/scan-hero.tsx`, `scan-hero.dom.test.tsx`

**Interfaces:**

- `<ScanHero onResolved={(r: ScanResolved) => void} />` where `ScanResolved` is `ScanButton`'s existing `onResolved` argument type (`{kind:"card"; phone; programId}` | `{kind:"voucher"; phone; voucherToken; rewardText}`). Re-export or import that type from `scan-button.tsx`.
- `"use client"`. Renders the mockup's `scan-target` button: a large tappable area with a cornered frame, a scan glyph, the label "Scan the customer's card", and the sub "Camera opens when you tap". Internally it renders `<ScanButton variant="...">` (or lifts `ScanButton`'s open-camera logic) so the whole hero area is the trigger. Simplest: render `<ScanButton>` with a new `variant="hero"` added to `scan-button.tsx` that applies the hero frame classes, keeping decode/resolve logic in one place. Add the `"hero"` variant to `ScanButton` and its type.
- Style: use `--primary` / `--gold` tokens, `--radius`, a dashed or cornered border, min-height ~13rem on mobile, larger on wide. Respect `prefers-reduced-motion` for the scan-line sweep (the mockup animates it; guard with the media query or drop the animation).

- [ ] **Step 1: Failing test** (jsdom) - render `<ScanHero onResolved={fn} />`; assert the label "Scan the customer's card" and a button role are present; assert clicking the target invokes `ScanButton`'s camera-open path (mock `ScanButton` to a stub that calls `onResolved` and assert wiring), OR assert `ScanButton` receives `variant="hero"` and the `onResolved` prop.
- [ ] **Step 2-4: fail, implement (incl. the `ScanButton` `"hero"` variant), pass.** Update `scan-button.dom.test.tsx` for the new variant's chrome.
- [ ] **Step 5: Commit** - `git commit -m "feat(counter): scan-hero as the primary serve action"`

---

### Task 4: `new-customer-panel.tsx`

**Files:** `src/app/dashboard/counter/new-customer-panel.tsx`, `new-customer-panel.dom.test.tsx`

**Interfaces:**

- `<NewCustomerPanel programId={string} onCreated={(phone: string, card: StampCard) => void} />`
- `"use client"`. A phone input (`inputMode="tel"`, placeholder "9123 4567") + a primary "Create card and first stamp" button + the note `'Ask at the till: "Want a loyalty card? Just your phone number."'`. On submit: build a `FormData` with `program_id` and `phone`, call `stampAction` (which creates the card via `add_stamp` and lands the first stamp), `toast.success` on ok / `toast.error` on failure, call `onCreated` on success, clear the input. Uses `useAsyncAction` for the pending state (same hook `serve-customer.tsx` uses).
- Light client-side check before calling: non-empty, at least 8 digits after stripping non-digits. The server action is the real validator.

- [ ] **Step 1: Failing test** (jsdom, `vi.mock("@/app/dashboard/actions")` returning a `stampAction` stub) - type a phone, click create; assert `stampAction` called with a `FormData` carrying `program_id` and `phone`; assert `onCreated` fired with the phone; assert the input cleared. A failing `stampAction` result -> `onCreated` not called, error toast (mock `sonner`).
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Commit** - `git commit -m "feat(counter): cashier-assisted new customer panel"`

---

### Task 5: `shop-join-poster.tsx`

**Files:** `src/app/dashboard/counter/shop-join-poster.tsx`, `shop-join-poster.dom.test.tsx`

**Interfaces:**

- `<ShopJoinPoster shopName={string} qrSvgMarkup={string} link={string} />` - `qrSvgMarkup` comes from `qrSvg(link)` computed server-side in `page.tsx` and passed down (same pattern as `ShopQrBlock` / `page.tsx` today).
- The poster: shop name, "Join our loyalty card", the QR, "Scan to join. Just your phone number.", a "via LoopKit" mark. A "Print poster" button. The printed surface must be theme-independent: force `bg-white text-black` on the poster element itself (not `bg-card`), so a dark-mode vendor still prints a white poster (matches the spec's "print-preview = theme-independent white").
- Print: reuse `CardLinkActions`' print behaviour if it prints a targeted element, else a `window.print()` scoped via a print stylesheet / `@media print` that hides everything except `.poster`. Check `card-link.tsx` first (`CardLinkActions` already has a "print-QR" button per the dashboard README).
- Can be a server component except the print button (client). Split: `<ShopJoinPoster>` server + a small `<PrintPosterButton>` client child, or make the whole thing client. Prefer server + client button.

- [ ] **Step 1: Failing test** (jsdom) - render with `shopName="Kopi Corner"`, a stub SVG, a link; assert the shop name, the join CTA copy, and the SVG are in the document; assert the poster element carries a white-background class (`bg-white`), not `bg-card`.
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Commit** - `git commit -m "feat(counter): printable shop join poster"`

---

### Task 6: `served-strip.tsx`

**Files:** `src/app/dashboard/counter/served-strip.tsx`, `served-strip.dom.test.tsx`

**Interfaces:**

- `type ServedEntry = { id: string; phone: string; note: string; undoable: boolean };`
- `<ServedStrip entries={ServedEntry[]} onUndo={(entry: ServedEntry) => void} />` - renders "Served just now" and each entry: masked phone, the note (`"6 to 7 of 8"` for a stamp, `"reward redeemed, free kopi-o"` for a redeem), and an "Undo" button only when `entry.undoable`. Renders nothing when `entries` is empty.

- [ ] **Step 1: Failing test** (jsdom) - 2 entries, one `undoable:true` one `false`; assert exactly one "Undo" button; clicking it calls `onUndo` with that entry; empty -> nothing rendered.
- [ ] **Step 2-4: fail, implement, pass.**
- [ ] **Step 5: Commit** - `git commit -m "feat(counter): served-just-now strip with single-level undo"`

---

### Task 7: recompose `serve-customer.tsx`

**Files:** `src/app/dashboard/serve-customer.tsx`, `src/app/dashboard/serve-customer.dom.test.tsx`

**Interfaces:**

- `ServeCustomer` keeps its current prop signature plus two new props: `shopName: string`, `shopJoinQrSvg: string`, `shopJoinLink: string` (for the poster), `vendorId` not needed (link is pre-built in `page.tsx`).
- Layout, top to bottom (mockup `counter-grid` = two columns on wide, stacked on mobile):
  - **Left column (`counter-entry`):**
    1. `<ScanHero onResolved={...} />` - the existing `ScanButton` `onResolved` logic (voucher -> `/dashboard/redeem-voucher`, different-program card -> route to that program's counter, same-program card -> fill phone + submit) moves here unchanged.
    2. A `counter-actions` row: two toggle buttons, "New customer" and "Shop join QR", each `aria-expanded`, revealing `<NewCustomerPanel>` / (`<ShopJoinPoster>` + its note) respectively. Only one open at a time.
    3. `<details className="manual">` with summary "Existing customer who can't scan? Enter their number" containing the existing phone `<form>` (the `formRef` form, phone `Input`, primary action button, "Look up" button) - moved verbatim inside the `<details>`.
    4. `<ServedStrip entries={served} onUndo={handleUndo} />`.
  - **Right column (`active-card`):** the result panel. When `result === null`, render the empty state (mockup `active-empty`: a faint seal row, the text "No customer yet. Scan a card, add a new customer, or enter a number to begin."). When `result !== null`, render the existing per-mode result blocks (`stamp` / `lucky` / `plant` / `chance`) unchanged, plus the existing "Regenerate card" dialog.
- **New state:**
  - `served: ServedEntry[]` - push an entry after each successful `handleStampVisit` (`undoable: true`, note `"{prev} to {new} of {stampsRequired}"`) and after each redeem (`undoable: false`). Cap at the last 5. Cleared on unmount is automatic; also clear the _undoable_ flag on the previous entry whenever a new action happens (single-level undo).
  - `handleUndo(entry)`: `run(async () => { const fd = new FormData(); fd.set("program_id", programId); fd.set("phone", entry.phone); fd.set("delta", "-1"); fd.set("reason", "undo"); const res = await adjustStampAction(fd); ... })` - on success, toast, mark the entry not undoable, `router.refresh()`, and if the current `result` is that phone, refresh its card view (re-`lookupAction` or decrement locally).
  - `onCreated` from `<NewCustomerPanel>`: set `result` to a fresh `stamp` result for the new card and push a served entry.
- Import `adjustStampAction` into `serve-customer.tsx` (currently not imported).
- Keep `RewardCelebration`, `useAsyncAction`, all existing handlers.

- [ ] **Step 1: Write failing tests** (`serve-customer.dom.test.tsx`, jsdom, mock `@/app/dashboard/actions`, `sonner`, `next/navigation`, and the child components `ScanHero`/`NewCustomerPanel`/`ShopJoinPoster`/`ServedStrip` to stubs):
  - Renders the scan hero and the empty active-card state on first render (`result` null): `getByText("No customer yet...")`.
  - The manual phone form is inside a collapsed `<details>` (assert the `<summary>` text is present and the `<input name="phone">` is within a `<details>` element).
  - "New customer" and "Shop join QR" toggles: clicking "New customer" shows the `NewCustomerPanel` stub and sets `aria-expanded="true"`; clicking "Shop join QR" hides it and shows the poster stub.
  - After a successful stamp (drive `handleStampVisit` via submitting the manual form with `stampAction` mock returning `{success:true, card:{...}, rewardReady:false}`): the active card shows the count, and a served entry is passed to the `ServedStrip` stub with `undoable:true`.
  - `handleUndo`: invoke the `ServedStrip` stub's `onUndo` -> `adjustStampAction` called with `delta:"-1"`, `reason:"undo"`.
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement the recompose.** Move logic, do not rewrite the per-mode result blocks.
- [ ] **Step 4: `pnpm build` + `pnpm test src/app/dashboard/`.** Green. `pnpm build` mandatory (client component, heavy).
- [ ] **Step 5: Commit** - `git commit -m "feat(counter): recompose serve-customer scan-first with empty state"`

---

### Task 8: `counter/page.tsx`

**Files:** `src/app/dashboard/counter/page.tsx`, `src/app/dashboard/counter/counter-page.dom.test.tsx`

- [ ] **Step 1: Update the page**
  - `const { p, phone } = await searchParams;`
  - `const programs = await listPrograms();` - `if (programs.length === 0) redirect("/dashboard");`
  - When `!p`: fetch active-card counts per program (a `cards` query grouped, or reuse a `stats.ts` helper), `const target = pickDefaultCounterProgram(programs, counts); redirect(\`/dashboard/counter?p=${target}\`);`
  - `const program = currentProgram(programs, p); if (!program) redirect("/dashboard");`
  - Build the shop join link + QR: same `headers()` + `NEXT_PUBLIC_BASE_URL` origin logic as the old `dashboard/page.tsx`, `link = \`${origin}/c?v=${user.id}\``, `qr = await qrSvg(link)`. Get `user`from`requireVendor()`. Get `shopName` from the vendor profile (`getVendorProfile`/ whatever`layout.tsx` uses for the stall name - check; fall back to "Your stall").
  - Render: `<BackButton href="/dashboard" />`, the head row (program name + badge + `describeProgram`, plus a program chip when `programs.length > 1` - the chip can be a plain `<Link>` to `/dashboard/counter?p=` cycling or a `ProgramSwitcher`; a `ProgramSwitcher` with `basePath="/dashboard/counter"` is the existing idiom), `<RememberProgram id={program.id} />`, then `<ServeCustomer key={program.id} programId={program.id} type={program.type} stampsRequired={program.stamps_required} rewardText={program.reward_text} initialPhone={phone} pointsRedemptionMode={config.redemption_mode} shopName={shopName} shopJoinQrSvg={qr} shopJoinLink={link} />`.
  - Sweep em dashes from the file.
- [ ] **Step 2: Update `counter-page.dom.test.tsx`** - mock `listPrograms`, `qrSvg`, `next/headers`, the profile read, and `ServeCustomer`/`RememberProgram` stubs. Assert: with `p` set, `ServeCustomer` gets the program props + `shopJoinQrSvg`; `RememberProgram` gets the program id; with no `p`, a redirect to `?p=<default>` fires (assert `redirect` mock called with a `?p=` URL).
- [ ] **Step 3: `pnpm build` + `pnpm check` + `pnpm test`.** Green.
- [ ] **Step 4: Commit** - `git commit -m "feat(counter): scan-first counter page with default-program routing"`

---

### Task 9: CHANGELOG + READMEs

- [ ] **`CHANGELOG.md`** `### Changed`: `The Counter is scan-first: a large scan target is the primary action, manual phone entry collapses into a fallback, the active card starts empty, and a vendor can add a new customer or print a shop join poster inline.`
- [ ] **`src/app/dashboard/counter/README.md`** - describe `page.tsx`'s new routing, `counter-view.ts`, `remember-program.tsx`, `scan-hero.tsx`, `new-customer-panel.tsx`, `shop-join-poster.tsx`, `served-strip.tsx`.
- [ ] **`src/app/dashboard/README.md`** - update the `serve-customer.tsx` bullet (scan-first recompose, empty state, served strip, undo via `adjustStampAction`); update Connectivity.
- [ ] **Root `README.md`** - one sentence: `Sub-plan 4 landed: the Counter is scan-first with an empty active card, inline new-customer, and a printable join poster.`
- [ ] **Commit** - `git commit -m "docs: scan-first counter across CHANGELOG and folder READMEs"`

---

## Self-Review

- **Spec coverage:** scan-first hero (Task 3), collapsed manual fallback (Task 7), empty active card (Task 7), new-customer via `add_stamp` (Task 4), shop join QR poster (Task 5), undo via `adjustStampAction delta -1 reason "undo"` single level (Tasks 6, 7), last-used-program routing (Tasks 1, 2, 8). Covered. Program-specific join link is explicitly deferred with rationale (see "Decisions locked").
- **Engine untouched:** every `ServeResult` branch and handler in `serve-customer.tsx` is moved, not rewritten. `adjustStampAction` is an existing action (migration 0042).
- **Type consistency:** `ScanResolved` (from `scan-button.tsx`) reused by `ScanHero`. `ServedEntry` defined in `served-strip.tsx`, imported by `serve-customer.tsx`. `StampCard` from `@/app/dashboard/card` throughout.
- **Placeholder scan:** each task names files, props, and the exact action call. Print behaviour has a "check `card-link.tsx` first" instruction rather than a guess.

## Execution Handoff

Subagent-driven. Cheap model for Tasks 1, 2, 6, 9. Standard model for Tasks 3, 4, 5, 7, 8 (Task 7 is the heavy recompose - review it carefully against the mockup and confirm no `ServeResult` branch regressed).
