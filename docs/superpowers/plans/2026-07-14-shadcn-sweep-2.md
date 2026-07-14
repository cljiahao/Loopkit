# shadcn Sweep Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the last three hand-rolled form controls found in a repo-wide sweep — two native `<select>`s and three native checkbox toggles — to shadcn's `Select` and `Switch` components.

**Architecture:** `Select` is already installed (`src/components/ui/select.tsx`). `Switch` is not — installed once, in Task B (the first task in dispatch order that needs it; Task A only needs the already-installed `Select`). Three independent file-level tasks: `schedule-retirement-form.tsx` (Select only), `qkit-earn-settings.tsx` (Select + Switch, and where the Switch install happens), `setup-form.tsx` (Switch only, ×2). No task depends on another's code — only on the shared `Switch` install landing before a task that uses it, which task ordering (B before C) guarantees without a hard dependency edge.

**Tech Stack:** Next.js 16 App Router, `radix-ui` (already a dependency), TypeScript strict, Tailwind v4, Vitest + Testing Library (jsdom), pnpm.

## Global Constraints

- Keep the codebase clean: no leftover native `<select>` or `<input type="checkbox">` markup coexisting with the new components in any of the three files.
- Every task's commit must leave `pnpm check` (prettier + eslint + tsc) clean.
- Zero changes to `src/app/setup/actions.ts` or `src/app/dashboard/actions.ts` — both already accept the exact values the new Radix components bubble into `FormData` (`Select`'s `name` prop renders a hidden native `<select>` that participates in form submission identically to a real one; `Switch`'s default bubble value when checked is the literal string `"on"`, matching `saveQkitEarnConfigAction`'s existing `formData.get("enabled") === "on"` check). Each task must verify this claim holds for its own field(s) rather than assume it.
- `setup-form.tsx`'s hidden mirror-input pattern (`head_start`/`carry_over_stamps` as literal `"true"`/`"false"` strings, submitted via a separate `<input type="hidden">` alongside the visible control) must be preserved exactly — only the visible checkbox becomes a `Switch`, wired via `checked`/`onCheckedChange` instead of `checked`/`onChange`.
- `qkit-earn-settings.tsx`'s `Switch` uses the already-installed `Label` component (`@/components/ui/label`) for its text, matching this repo's established form-label pattern.
- Radix `SelectTrigger`'s rendered role is `combobox` (confirmed in `src/components/ui/select.tsx`, inherited from `SelectPrimitive.Trigger`) — existing `getByRole("combobox")` assertions in `qkit-earn-settings.dom.test.tsx` need no change. Radix `Switch`'s rendered role is `switch`, not `checkbox` — any `getByRole("checkbox", ...)` assertion targeting it must become `getByRole("switch", ...)`.

---

### Task A: `schedule-retirement-form.tsx` → shadcn `Select`

**Files:**

- Modify: `src/app/setup/schedule-retirement-form.tsx`
- Modify: `src/app/setup/schedule-retirement-form.dom.test.tsx` (full rewrite)

**Interfaces:**

- No exported signature change — `ScheduleRetirementForm({ program, successors })` is unchanged.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/app/setup/schedule-retirement-form.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { scheduleMock } = vi.hoisted(() => ({
  scheduleMock: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/app/setup/actions", () => ({
  scheduleRetirementAction: scheduleMock,
}));

import { ScheduleRetirementForm } from "@/app/setup/schedule-retirement-form";

describe("ScheduleRetirementForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a successor picker defaulting to the first successor, and a date input", async () => {
    render(
      <ScheduleRetirementForm
        program={{ id: "p1", name: "Old card" } as never}
        successors={[
          { id: "p2", name: "New card" } as never,
          { id: "p3", name: "Another card" } as never,
        ]}
      />,
    );
    const trigger = screen.getByLabelText("Replacement card");
    expect(trigger).toHaveTextContent("New card");

    await userEvent.click(trigger);
    expect(screen.getByText("Another card")).toBeInTheDocument();

    expect(screen.getByLabelText("Retirement date")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Schedule retirement" }),
    ).toBeInTheDocument();
  });

  it("submits the program id, chosen successor, and date", async () => {
    const user = userEvent.setup();
    render(
      <ScheduleRetirementForm
        program={{ id: "p1", name: "Old card" } as never}
        successors={[
          { id: "p2", name: "New card" } as never,
          { id: "p3", name: "Another card" } as never,
        ]}
      />,
    );
    await user.click(screen.getByLabelText("Replacement card"));
    await user.click(screen.getByText("Another card"));
    await user.type(screen.getByLabelText("Retirement date"), "2030-01-01");
    await user.click(
      screen.getByRole("button", { name: "Schedule retirement" }),
    );
    expect(scheduleMock).toHaveBeenCalled();
    const submittedData = scheduleMock.mock.calls[0][1] as FormData;
    expect(submittedData.get("successor_id")).toBe("p3");
    expect(submittedData.get("id")).toBe("p1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test schedule-retirement-form.dom.test.tsx`
Expected: FAIL — the component still renders a native `<select>`, so `trigger` has no text content like "New card" (a native `<select>`'s outer element isn't itself labeled with the selected option's text the way `SelectTrigger`+`SelectValue` renders it), and clicking it doesn't open a Radix listbox containing "Another card" as clickable text.

- [ ] **Step 3: Write minimal implementation**

In `src/app/setup/schedule-retirement-form.tsx`, add the import:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

Replace the native `<select>` block:

```tsx
<select
  id="successor_id"
  name="successor_id"
  required
  className="h-11 w-full rounded-xl border bg-card px-3 text-sm"
>
  {successors.map((s) => (
    <option key={s.id} value={s.id}>
      {s.name}
    </option>
  ))}
</select>
```

with:

```tsx
<Select name="successor_id" required defaultValue={successors[0]?.id}>
  <SelectTrigger id="successor_id" className="h-11 w-full rounded-xl">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {successors.map((s) => (
      <SelectItem key={s.id} value={s.id}>
        {s.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test schedule-retirement-form.dom.test.tsx`
Expected: PASS (2/2 tests)

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/schedule-retirement-form.tsx src/app/setup/schedule-retirement-form.dom.test.tsx
git commit -m "feat: migrate ScheduleRetirementForm's successor picker to shadcn Select"
```

---

### Task B: `qkit-earn-settings.tsx` → shadcn `Select` + `Switch`

**Files:**

- Create: `src/components/ui/switch.tsx` (generated by shadcn CLI)
- Modify: `src/app/dashboard/qkit-earn-settings.tsx`
- Modify: `src/app/dashboard/qkit-earn-settings.dom.test.tsx`

**Interfaces:**

- Produces: `src/components/ui/switch.tsx` exporting `Switch` (shadcn `new-york`-style Radix `Switch` wrapper), consumed by this task and by Task C.
- No exported signature change — `QkitEarnSettings({ programs, current, isPro })` is unchanged.

- [ ] **Step 1: Install shadcn Switch**

Run: `pnpm dlx shadcn@latest add switch`
Expected: creates `src/components/ui/switch.tsx` following the same `new-york`-style pattern as this repo's other generated files (`import { Switch as SwitchPrimitive } from "radix-ui"`, exporting a composed `Switch`). Accept CLI defaults if prompted — `components.json` already has this repo's config.

- [ ] **Step 2: Run `pnpm check` to confirm the generated file compiles cleanly**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 3: Write the failing test**

Replace the full contents of `src/app/dashboard/qkit-earn-settings.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QkitEarnSettings } from "./qkit-earn-settings";

vi.mock("./actions", () => ({
  saveQkitEarnConfigAction: vi.fn().mockResolvedValue({ success: true }),
}));

describe("QkitEarnSettings", () => {
  it("shows an upgrade prompt instead of the form when not Pro", () => {
    render(
      <QkitEarnSettings
        programs={[{ id: "p1", name: "Coffee Stamps" }]}
        current={null}
        isPro={false}
      />,
    );
    expect(screen.getByText(/upgrade to pro/i)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("lets a Pro vendor pick a program and enable it", () => {
    render(
      <QkitEarnSettings
        programs={[{ id: "p1", name: "Coffee Stamps" }]}
        current={null}
        isPro={true}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("switch", { name: /earn from qkit orders/i }),
    );
    expect(
      screen.getByRole("switch", { name: /earn from qkit orders/i }),
    ).toBeChecked();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test qkit-earn-settings.dom.test.tsx`
Expected: FAIL — `getByRole("switch", ...)` finds nothing, since the component still renders a native `<input type="checkbox">` (role `checkbox`, not `switch`).

If this step instead fails with a jsdom/Radix runtime error once Step 5's implementation lands (rather than a clean "not found" failure), that signals `Switch` needs its own jsdom polyfill in `test/setup.ts` beyond the four already there (`hasPointerCapture`, `scrollIntoView`, `complete`, `naturalWidth`) — diagnose the actual error message and add the minimal stub it calls for, following the same guarded-no-op pattern as the existing four.

- [ ] **Step 5: Write minimal implementation**

In `src/app/dashboard/qkit-earn-settings.tsx`, add the imports:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
```

Replace the checkbox `<label>` block:

```tsx
<label className="flex items-center gap-2 text-sm">
  <input
    type="checkbox"
    name="enabled"
    defaultChecked={current?.enabled ?? false}
    aria-label="Earn from qkit orders"
  />
  Earn from qkit orders
</label>
```

with:

```tsx
<div className="flex items-center gap-2">
  <Switch
    id="qkit-earn-enabled"
    name="enabled"
    defaultChecked={current?.enabled ?? false}
    aria-label="Earn from qkit orders"
  />
  <Label htmlFor="qkit-earn-enabled" className="text-sm">
    Earn from qkit orders
  </Label>
</div>
```

Replace the native `<select>` block:

```tsx
<select
  name="program_id"
  defaultValue={current?.programId ?? ""}
  className="w-full rounded border p-2 text-sm"
>
  <option value="" disabled>
    Choose a program
  </option>
  {programs.map((p) => (
    <option key={p.id} value={p.id}>
      {p.name}
    </option>
  ))}
</select>
```

with:

```tsx
<Select name="program_id" defaultValue={current?.programId || undefined}>
  <SelectTrigger className="w-full">
    <SelectValue placeholder="Choose a program" />
  </SelectTrigger>
  <SelectContent>
    {programs.map((p) => (
      <SelectItem key={p.id} value={p.id}>
        {p.name}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test qkit-earn-settings.dom.test.tsx`
Expected: PASS (2/2 tests)

- [ ] **Step 7: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/switch.tsx src/app/dashboard/qkit-earn-settings.tsx src/app/dashboard/qkit-earn-settings.dom.test.tsx
git commit -m "feat: migrate QkitEarnSettings to shadcn Select + Switch"
```

---

### Task C: `setup-form.tsx` → shadcn `Switch` (×2)

**Files:**

- Modify: `src/app/setup/setup-form.tsx`

**Interfaces:**

- Consumes: `Switch` from `@/components/ui/switch` (installed in Task B).
- No exported signature change — `SetupForm`'s props are unchanged.

- [ ] **Step 1: Add the import**

In `src/app/setup/setup-form.tsx`, add to the existing `@/components/ui/*` imports (alongside `Button`, `Input`, `Label`):

```tsx
import { Switch } from "@/components/ui/switch";
```

- [ ] **Step 2: Replace the head-start checkbox**

Replace:

```tsx
<input
  type="checkbox"
  id="head_start_checkbox"
  checked={headStart}
  onChange={(e) => setHeadStart(e.target.checked)}
  className="mt-0.5 size-4 rounded border-input"
/>
```

with:

```tsx
<Switch
  id="head_start_checkbox"
  checked={headStart}
  onCheckedChange={setHeadStart}
  className="mt-0.5"
/>
```

The surrounding `<div>`, `<label htmlFor="head_start_checkbox">` (with its nested `<span>`s), and the trailing `<input type="hidden" name="head_start" value={headStart ? "true" : "false"} />` stay exactly as-is — only the checkbox `<input>` element itself changes.

- [ ] **Step 3: Replace the carry-over-stamps checkbox**

Replace:

```tsx
<input
  type="checkbox"
  id="carry_over_stamps_checkbox"
  checked={carryOverStamps}
  onChange={(e) => setCarryOverStamps(e.target.checked)}
  className="mt-0.5 size-4 rounded border-input"
/>
```

with:

```tsx
<Switch
  id="carry_over_stamps_checkbox"
  checked={carryOverStamps}
  onCheckedChange={setCarryOverStamps}
  className="mt-0.5"
/>
```

Same rule: the surrounding `<div>`, `<label htmlFor="carry_over_stamps_checkbox">`, and the trailing `<input type="hidden" name="carry_over_stamps" value={carryOverStamps ? "true" : "false"} />` stay exactly as-is.

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: All pass. `setup-form.tsx` has no dedicated test file in this repo (confirmed — no page/component-level test precedent for this form), so no test file changes are expected or required for this task; the full-suite run confirms no other test (e.g. any `/setup` page-level integration test, if one exists) broke.

- [ ] **Step 5: Manually verify in the running app**

Run: `pnpm dev`, go to `/setup`, create or edit a stamp/plant/streak-type card. Confirm both "Give new customers a head start" and "Carry over customers' current stamp count onto the new card" (the latter only shows when applicable — e.g. on a migrate/change-type flow) render as toggle switches, default to their expected initial state, and toggling them updates the switch's visual on/off state. Submit the form and confirm the setting persists (reload the edit page, confirm the switch reflects the saved value).

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/setup-form.tsx
git commit -m "feat: migrate SetupForm's head-start and carry-over toggles to shadcn Switch"
```
