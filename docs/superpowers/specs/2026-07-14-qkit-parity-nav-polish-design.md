# qkit-parity nav polish: instant switcher, settings page, clean title

Date: 2026-07-14

## Problem

The just-shipped "Nav Reachability + Responsive Setup" feature invented its
own program-switching UX (`ProgramSwitcher`: a `<select>` + a "Switch"
submit button, two separate pickers depending on merged vs filtered view)
instead of following the pattern loopkit's sibling app **qkit** already
ships and has proven out for the identical problem (switching which
"booth" — qkit's equivalent of a "program" — a vendor is viewing stats
for). User feedback, verbatim: "why do i need a switch button? why cn you
follow how qkit handle the stats for each booth? ... there's already a
good working example, but you choose to make up your own."

Two more items landed in the same batch:

- The "qkit integration" section (`QkitEarnSettings`, a Pro-gated form
  wiring a stamp program to qkit's order-complete webhook) sits as a
  `<details>` collapsible bolted onto the dashboard body. qkit itself puts
  its analogous page — settings for its own board — behind a dedicated
  `/dashboard/settings` route, reached from the account dropdown, not the
  dashboard body.
- The browser tab title is a full marketing tagline
  (`"loopkit — turn one-time buyers into regulars"`); qkit's is short
  (`"QKit: booth ordering"`).

## Investigation: what qkit actually does

Read directly from `qkit/src/app/dashboard/stats/{page,stats-controls}.tsx`:

- One route (`/dashboard/stats`), no `/dashboard/[boothId]/stats` segment.
- A single `<select>` (`StatsControls`, `"use client"`), only rendered when
  `booths.length > 1`. Options: `"All booths"` (value `"all"`) plus every
  booth by name.
- `onChange` calls `setParam("booth", value)`, which builds
  `new URLSearchParams(searchParams.toString())`, sets the one key, and
  calls `router.push`. No submit button, no page nav — the server
  component re-runs and refetches on the new params.
- `selectedBooth` on the server side is validated against the vendor's own
  booth ids, falling back to `"all"` if missing/invalid.

qkit's `/dashboard/settings` ("Board settings") is reached from the
account dropdown (`DropdownMenuItem` with a `Settings` icon), not a
top-level nav tab and not the dashboard body. qkit has no "integrations"
UI concept — grepping found only a frozen-but-unconsumed API contract
comment, nothing user-facing to copy for item 2's _content_, only its
_placement pattern_ (settings live on their own page, off the dropdown).

qkit's root title: `"QKit: booth ordering"` — literal string, no template,
no `%s |` interpolation, same title on every route.

## Decisions

- Replace `ProgramSwitcher` (GET form + submit button) with a client
  component using `useRouter`/`useSearchParams`, mirroring qkit's
  `StatsControls.setParam` exactly: copy existing params, set `p`, push.
  This also fixes a real gap — the merged-view picker currently drops
  Customers' `q` search term on switch; copying existing params fixes
  that as a side effect, not a separate feature.
- Add an explicit **"All programs"** option (value `""`, the sentinel for
  "no `?p=`") to the same select — qkit always offers "All booths"
  alongside specific ones. Today there's no way to go from a filtered view
  back to the merged view via the picker at all.
- One component replaces three things: the merged-view picker, the
  filtered-view picker, and Customers' own hand-rolled duplicate inline
  `<select>+button>` (`customers/page.tsx`'s filtered branch never used
  `ProgramSwitcher` — it re-implemented the same markup inline). All three
  collapse to one shared component, used identically on every branch of
  every page.
- Single-program vendors still get the redirect-into-filtered-view
  behavior shipped in the last feature's final review — that's an
  orthogonal reachability fix, not part of this UX change, and the select
  still hides at `programs.length <= 1` (matches qkit's `booths.length > 1`
  gate) so there'd be nothing to pick from anyway.
- Settings: new `/dashboard/settings` page, added to the account dropdown
  (between Plan and Profile) with a `Settings` lucide icon, matching
  qkit's placement pattern. Page title is "Settings" (not "Board
  settings" — that name is specific to qkit's own alerting feature, which
  loopkit doesn't have). `QkitEarnSettings` moves here unmodified,
  `dashboard/page.tsx` drops its `<details>` wrapper and the
  `qkit_earn_config` query it only needed for that block.
- Title: `"loopkit: stamp cards"` — same `Brand: short-descriptor` shape
  as `"QKit: booth ordering"`. Description meta is untouched (qkit keeps
  its own description too; only the `<title>` is short).

## A. `ProgramSwitcher` → instant client-side picker

`src/app/dashboard/program-switcher.tsx` rewritten as a client component:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function ProgramSwitcher({
  programs,
  currentId,
  basePath,
}: {
  programs: { id: string; name: string }[];
  currentId: string;
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (programs.length <= 1) return null;

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set("p", value);
    } else {
      params.delete("p");
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  return (
    <select
      value={currentId}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="Switch program"
      className="mb-4 h-9 rounded-lg border bg-card px-3 text-sm"
    >
      <option value="">All programs</option>
      {programs.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
```

`currentId` is `""` on merged views (selects "All programs") and
`program.id` on filtered views — both branches of Stats/Activity/Customers
already compute exactly this today (`programs[0]?.id ?? ""` becomes just
`""`; `program.id` is unchanged). `basePath` replaces `action` (e.g.
`"/dashboard/stats"`) — same string, new prop name since it's no longer a
form target.

Every call site (`stats/page.tsx`, `activity/page.tsx`, both branches of
`customers/page.tsx`) passes the same `programs`/`basePath`; only
`currentId` differs between the merged (`""`) and filtered (`program.id`)
branch. Customers' filtered branch also **deletes** its own duplicate
inline picker block (lines ~125–151 today) and renders `<ProgramSwitcher>`
instead, dropping the now-redundant hidden `q` input — `useSearchParams`
already carries `q` forward automatically.

## B. Settings page

New files:

- `src/app/dashboard/settings/page.tsx` — server component. Fetches
  `programs`, `pro`, and the existing `qkit_earn_config` row (same query
  currently in `dashboard/page.tsx`), renders a page header ("Settings")
  and `<QkitEarnSettings>` directly — no `<details>` wrapper, since it's
  no longer sharing a page with the program grid.

Modified:

- `src/app/dashboard/page.tsx` — remove the `qkit_earn_config` Supabase
  query, the `QkitEarnSettings` import, and the trailing `<details>`
  block entirely.
- `src/app/dashboard/dashboard-nav.tsx` — add one `DropdownMenuItem`
  between the existing Plan and Profile entries:
  ```tsx
  <DropdownMenuItem asChild>
    <Link href="/dashboard/settings" className="cursor-pointer">
      <Settings className="size-4" />
      Settings
    </Link>
  </DropdownMenuItem>
  ```
  (`Settings` added to the existing `lucide-react` import list.)
- `src/app/dashboard/actions.ts` — `saveQkitEarnConfigAction`'s
  `revalidatePath("/dashboard")` becomes
  `revalidatePath("/dashboard/settings")`.

## C. Title

`src/app/layout.tsx`: `metadata.title` changes from
`"loopkit — turn one-time buyers into regulars"` to
`"loopkit: stamp cards"`. `metadata.description` unchanged.

## Testing

- `program-switcher.dom.test.tsx` rewritten: mock `next/navigation`'s
  `useRouter`/`useSearchParams` (same approach any existing client
  component test in this repo already uses, if one does — otherwise
  `vi.mock("next/navigation", ...)` with a `push` spy); assert the select
  renders "All programs" + every program, assert `currentId` selects the
  right option, assert changing the value calls `router.push` with the
  expected URL (params copied from a seeded `useSearchParams` value, `p`
  set/deleted correctly), assert it renders nothing at `programs.length
<= 1`.
- `customers-page.dom.test.tsx` / `activity-page.dom.test.tsx`: any
  assertion on the old "Switch" button or the merged-view picker's
  `action` attribute is removed/updated to match the new component's
  props and behavior.
- New `settings/page.dom.test.tsx`-style coverage is out of scope per this
  repo's existing precedent (no page-level test exists for
  `dashboard/page.tsx` today either, which this page is structurally
  closest to) — `QkitEarnSettings`'s own existing test file
  (`qkit-earn-settings.dom.test.tsx`) is unaffected since the component
  itself doesn't change.

## Out of scope

- Any change to `QkitEarnSettings`'s own internal form/behavior.
- Any change to how Stats/Activity/Customers fetch or compute their
  underlying data (merged aggregate vs. per-program) — this is a picker
  and page-placement change only.
- Renaming "qkit integration" to anything else, or adding real
  vendor-facing "integrations" plumbing beyond what already exists.
