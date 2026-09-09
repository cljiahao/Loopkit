# Program Edit Safety + Reward Expiry Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Warn a vendor before an edit that moves the goalposts for customers who already hold a card, and make earned rewards expire 90 days after they are granted by default.

**Architecture:** Part 1 is a pure comparison helper (`src/lib/program-edit-impact.ts`) plus a client-only `AlertDialog` wrapper around the setup form's submit button; no server action changes. Part 2 changes one RPC default (`create_program`, migration `0046`) and one form default; `null` still means "never expires" and there is no data backfill.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, shadcn/ui (new-york), Supabase `@supabase/ssr` (RLS in Postgres), Vitest, pnpm 11, Node >= 24.

**Spec:** `docs/superpowers/specs/2026-09-09-program-edit-safety-design.md`

## Global Constraints

- TypeScript strict: no `any`, no `@ts-ignore`. Validate user input with Zod at every boundary.
- No em dashes in user-facing copy or code comments. Use period, comma, colon, or parens, or split into two sentences.
- Near-zero new code comments. One line max where a comment earns its place. No change-narration comments (the `comment-hygiene` CI check greps for them): state what the code does now, not what changed.
- Every changed folder needs its `README.md` updated in the same commit (the `readme-freshness` CI check fails the PR otherwise). Folders touched by this plan: `src/lib/`, `src/app/setup/`, `test/lib/`, `test/db/`, `supabase/migrations/`, `docs/superpowers/plans/`, and root (`CHANGELOG.md` pairs with root `README.md`).
- Any change under `src/` requires a `CHANGELOG.md` entry (the `changelog` CI check). Keep entries under `## [Unreleased]`; do not add a version heading (this PR does not bump `package.json`, currently `0.1.0`).
- Prefer shadcn components (`src/components/ui/`, CLI-managed, do not hand-edit) over hand-rolled markup. `src/components/ui/alert-dialog.tsx` already exists.
- Run `pnpm build` before opening the PR: `pnpm check` and `pnpm test` miss Next.js client/server bundle-boundary errors.
- No `isPro()` gating added by this work.
- Migrations: latest applied is `0045`. This plan adds `0046`. Migration filenames are `NNNN_loopkit_<slug>.sql`.
- Branch from a freshly pulled `main` (`git fetch -p && git checkout main && git pull --ff-only`). Single feature branch, sequential tasks, one PR. `main` rejects direct commits and force-push.
- After the migration lands, `src/lib/types.ts` may need regenerating, but a function's parameter default is not part of the generated types, so expect no change there.

## File Structure

| File                                                               | Responsibility                                                                                                                                                                                |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/program-edit-impact.ts` (new)                             | Pure. `ProgramSnapshot` type, `isProgressAffecting(before, after)`, `describeEditImpact(before, after, cardCount)`. No I/O, no React.                                                         |
| `test/lib/program-edit-impact.test.ts` (new)                       | Unit tests for the above.                                                                                                                                                                     |
| `src/lib/cards.ts` (modify)                                        | Add `programCardCount(programId)`: `count(*)` of `cards` for that program.                                                                                                                    |
| `test/lib/cards.test.ts` (modify)                                  | Add a `programCardCount` block (mock the Supabase client like the existing `listCards` block).                                                                                                |
| `src/app/setup/edit-impact-dialog.tsx` (new, `"use client"`)       | Wraps the submit button. Plain button when `impactLines` is null/empty, else a button that opens an `AlertDialog` whose confirm submits the form.                                             |
| `src/app/setup/edit-impact-dialog.dom.test.tsx` (new)              | DOM tests for the wrapper.                                                                                                                                                                    |
| `src/app/setup/setup-form.tsx` (modify)                            | New `cardCount` prop; compute `impactLines` from existing form state; swap the edit-mode submit button for `<EditImpactDialog>`; change the `reward_expiry_days` field default + helper copy. |
| `src/app/setup/setup-form.dom.test.tsx` (modify)                   | Two new blocks: dialog trigger behaviour, expiry-field default.                                                                                                                               |
| `src/app/setup/page.tsx` (modify)                                  | Call `programCardCount(editing.id)` and pass `cardCount` to the edit `<SetupForm>`.                                                                                                           |
| `supabase/migrations/0046_loopkit_reward_expiry_default.sql` (new) | `create or replace function loopkit.create_program(...)` identical to `0027` except `p_reward_expiry_days int default 90`.                                                                    |
| `test/db/reward-expiry-default.test.ts` (new)                      | Static SQL string-match on `0046`.                                                                                                                                                            |
| READMEs + `CHANGELOG.md`                                           | Folder READMEs per touched folder; CHANGELOG under `[Unreleased]`; root README running-narrative sentence.                                                                                    |

---

### Task 1: Pure edit-impact helper

**Files:**

- Create: `src/lib/program-edit-impact.ts`
- Test: `test/lib/program-edit-impact.test.ts`
- Modify: `src/lib/README.md`, `test/lib/README.md`, `CHANGELOG.md`, `README.md`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type ProgramSnapshot = { stamps_required: number; reward_text: string }`
  - `function isProgressAffecting(before: ProgramSnapshot, after: ProgramSnapshot): boolean`
  - `function describeEditImpact(before: ProgramSnapshot, after: ProgramSnapshot, cardCount: number): string[]`

- [ ] **Step 1: Write the failing test**

Create `test/lib/program-edit-impact.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isProgressAffecting,
  describeEditImpact,
} from "@/lib/program-edit-impact";

const base = { stamps_required: 8, reward_text: "Free coffee" };

describe("isProgressAffecting", () => {
  it("is false when nothing relevant changed", () => {
    expect(isProgressAffecting(base, { ...base })).toBe(false);
  });

  it("is false when reward_text differs only by surrounding whitespace", () => {
    expect(
      isProgressAffecting(base, { ...base, reward_text: "  Free coffee " }),
    ).toBe(false);
  });

  it("is true when stamps_required changed", () => {
    expect(isProgressAffecting(base, { ...base, stamps_required: 10 })).toBe(
      true,
    );
  });

  it("is true when reward_text changed", () => {
    expect(
      isProgressAffecting(base, { ...base, reward_text: "Free pastry" }),
    ).toBe(true);
  });
});

describe("describeEditImpact", () => {
  it("opens with the customer count", () => {
    const lines = describeEditImpact(base, { ...base, stamps_required: 10 }, 3);
    expect(lines[0]).toBe("3 customers have a card on this program.");
  });

  it("uses singular wording for one customer", () => {
    const lines = describeEditImpact(base, { ...base, stamps_required: 10 }, 1);
    expect(lines[0]).toBe("1 customer has a card on this program.");
  });

  it("describes a goal increase", () => {
    const lines = describeEditImpact(base, { ...base, stamps_required: 10 }, 3);
    expect(lines).toContain(
      "They keep the stamps they have. The goal moves from 8 to 10.",
    );
  });

  it("describes a goal decrease", () => {
    const lines = describeEditImpact(base, { ...base, stamps_required: 5 }, 3);
    expect(lines).toContain(
      "They keep the stamps they have. The goal drops from 8 to 5, so some may already have earned a reward.",
    );
  });

  it("describes a reward wording change and quotes the new text", () => {
    const lines = describeEditImpact(
      base,
      { ...base, reward_text: "Free pastry" },
      2,
    );
    expect(lines).toContain(
      'Rewards already earned keep the current wording. New rewards will read "Free pastry".',
    );
  });

  it("returns intro, stamps, then reward in a stable order for a combined change", () => {
    const lines = describeEditImpact(
      base,
      { stamps_required: 10, reward_text: "Free pastry" },
      4,
    );
    expect(lines).toEqual([
      "4 customers have a card on this program.",
      "They keep the stamps they have. The goal moves from 8 to 10.",
      'Rewards already earned keep the current wording. New rewards will read "Free pastry".',
    ]);
  });

  it("still returns lines when cardCount is 0 (the caller gates on count)", () => {
    const lines = describeEditImpact(base, { ...base, stamps_required: 10 }, 0);
    expect(lines[0]).toBe("0 customers have a card on this program.");
    expect(lines.length).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- program-edit-impact`
Expected: FAIL, cannot resolve `@/lib/program-edit-impact`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/program-edit-impact.ts`:

```ts
export type ProgramSnapshot = {
  stamps_required: number;
  reward_text: string;
};

function rewardChanged(
  before: ProgramSnapshot,
  after: ProgramSnapshot,
): boolean {
  return before.reward_text.trim() !== after.reward_text.trim();
}

export function isProgressAffecting(
  before: ProgramSnapshot,
  after: ProgramSnapshot,
): boolean {
  return (
    before.stamps_required !== after.stamps_required ||
    rewardChanged(before, after)
  );
}

export function describeEditImpact(
  before: ProgramSnapshot,
  after: ProgramSnapshot,
  cardCount: number,
): string[] {
  const lines: string[] = [];

  const noun = cardCount === 1 ? "customer has" : "customers have";
  lines.push(`${cardCount} ${noun} a card on this program.`);

  if (after.stamps_required > before.stamps_required) {
    lines.push(
      `They keep the stamps they have. The goal moves from ${before.stamps_required} to ${after.stamps_required}.`,
    );
  } else if (after.stamps_required < before.stamps_required) {
    lines.push(
      `They keep the stamps they have. The goal drops from ${before.stamps_required} to ${after.stamps_required}, so some may already have earned a reward.`,
    );
  }

  if (rewardChanged(before, after)) {
    lines.push(
      `Rewards already earned keep the current wording. New rewards will read "${after.reward_text.trim()}".`,
    );
  }

  return lines;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- program-edit-impact`
Expected: PASS (all cases).

- [ ] **Step 5: Update docs**

- `src/lib/README.md`: add a `Contents` bullet:
  `- \`program-edit-impact.ts\` — \`isProgressAffecting\` / \`describeEditImpact\`: pure comparison of a program's before/after \`stamps_required\` and \`reward_text\`, and the plain-language lines the setup form shows a vendor before saving a goalpost-moving edit`
- `test/lib/README.md`: add a `Contents` bullet:
  `- \`program-edit-impact.test.ts\` — \`isProgressAffecting\` (stamps or trimmed reward-text change; whitespace-only reward change is not), \`describeEditImpact\` (singular/plural intro, goal up vs down wording, quoted new reward text, stable line order, lines still returned at count 0)`
- `CHANGELOG.md`, under `## [Unreleased]` `### Added` (create the `### Added` subsection under `### Changed` if absent):
  `- Editing a stamp goal or reward wording on a loyalty card that customers already hold now asks the vendor to confirm, spelling out that existing stamps are kept and the goal or wording only changes going forward.`
- `README.md` (root): find the running-narrative paragraph the dashboard-redesign entry last edited (search for "Serve a customer" or "briefing"); append one sentence: `Editing a card that customers already hold now confirms the change first, and newly earned rewards expire after 90 days unless the vendor clears that field.`

- [ ] **Step 6: Commit**

```bash
git add src/lib/program-edit-impact.ts test/lib/program-edit-impact.test.ts src/lib/README.md test/lib/README.md CHANGELOG.md README.md
git commit -m "feat(setup): pure helper for program edit-impact lines"
```

---

### Task 2: `programCardCount` data helper

**Files:**

- Modify: `src/lib/cards.ts`, `test/lib/cards.test.ts`, `src/lib/README.md`, `test/lib/README.md`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `function programCardCount(programId: string): Promise<number>`

**Context:** `src/lib/cards.ts` already exports `activeCardCountsByProgram` and `listCards`, both using `createServerClient()` from `@/lib/supabase/server`. `cards` has no `status` column: one row per (program, phone) is one customer on that program. Look at the existing `listCards` implementation and its test for the client-mock shape before writing this.

- [ ] **Step 1: Write the failing test**

In `test/lib/cards.test.ts`, add a block (match the file's existing mock style for `createServerClient`):

```ts
describe("programCardCount", () => {
  it("returns the exact count of cards for the program", async () => {
    const eq = vi.fn().mockResolvedValue({ count: 4, error: null });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    mockCreateServerClient({ from });

    const { programCardCount } = await import("@/lib/cards");
    await expect(programCardCount("prog-1")).resolves.toBe(4);

    expect(from).toHaveBeenCalledWith("cards");
    expect(select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(eq).toHaveBeenCalledWith("program_id", "prog-1");
  });

  it("treats a null count as 0", async () => {
    const eq = vi.fn().mockResolvedValue({ count: null, error: null });
    const from = vi.fn().mockReturnValue({ select: () => ({ eq }) });
    mockCreateServerClient({ from });

    const { programCardCount } = await import("@/lib/cards");
    await expect(programCardCount("prog-1")).resolves.toBe(0);
  });

  it("throws on a query error", async () => {
    const eq = vi
      .fn()
      .mockResolvedValue({ count: null, error: { message: "boom" } });
    const from = vi.fn().mockReturnValue({ select: () => ({ eq }) });
    mockCreateServerClient({ from });

    const { programCardCount } = await import("@/lib/cards");
    await expect(programCardCount("prog-1")).rejects.toThrow(
      "programCardCount: boom",
    );
  });
});
```

Adjust `mockCreateServerClient` / the mock helper name to whatever `cards.test.ts` already uses. If the existing tests mock via `vi.mock("@/lib/supabase/server", ...)` with a module-level `mockFrom`, follow that exact pattern instead of the shape above.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- cards`
Expected: FAIL, `programCardCount` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/cards.ts`, add near `activeCardCountsByProgram`:

```ts
export async function programCardCount(programId: string): Promise<number> {
  const supabase = await createServerClient();
  const { count, error } = await supabase
    .from("cards")
    .select("id", { count: "exact", head: true })
    .eq("program_id", programId);
  if (error) throw new Error(`programCardCount: ${error.message}`);
  return count ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- cards`
Expected: PASS.

- [ ] **Step 5: Update docs**

- `src/lib/README.md`: extend the `cards.ts` bullet with:
  `; \`programCardCount\`: exact \`count(*)\` of one program's cards (one row per customer), backing the setup form's edit-impact confirmation`
- `test/lib/README.md`: extend the `cards.test.ts` bullet with:
  `; \`programCardCount\`: exact-count query scoped to \`program_id\`, null count coerced to 0, throws on error`

- [ ] **Step 6: Commit**

```bash
git add src/lib/cards.ts test/lib/cards.test.ts src/lib/README.md test/lib/README.md
git commit -m "feat(setup): programCardCount for the edit-impact dialog"
```

---

### Task 3: `EditImpactDialog` client component

**Files:**

- Create: `src/app/setup/edit-impact-dialog.tsx`, `src/app/setup/edit-impact-dialog.dom.test.tsx`
- Modify: `src/app/setup/README.md`

**Interfaces:**

- Consumes: nothing from earlier tasks (it takes plain `string[]`).
- Produces:

```ts
function EditImpactDialog(props: {
  impactLines: string[] | null;
  pending: boolean;
  label: React.ReactNode;
}): React.JSX.Element;
```

Renders a `type="submit"` button with `label` when `impactLines` is `null` or empty. Otherwise renders a `type="button"` button (same styling) that opens an `AlertDialog`; the dialog body lists every line; the confirm action calls `event.currentTarget.form?.requestSubmit()` via the button's closest form, and the cancel action just closes.

**Context:** `src/components/ui/alert-dialog.tsx` exports `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel` (standard shadcn new-york). The existing submit button in `setup-form.tsx` is `<Button type="submit" size="lg" disabled={pending} className="h-12 w-full rounded-xl text-base font-semibold">`. Reuse those exact classes so the swap is visually identical.

`AlertDialogDescription` renders a `<p>`; do not nest block elements in it. Put the lines in a `<ul>` that is a sibling of `AlertDialogDescription` inside `AlertDialogHeader`, or replace the description with a plain `<div>` wrapper.

- [ ] **Step 1: Write the failing test**

Create `src/app/setup/edit-impact-dialog.dom.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EditImpactDialog } from "@/app/setup/edit-impact-dialog";

function renderInForm(
  ui: React.ReactNode,
  onSubmit = vi.fn((e) => e.preventDefault()),
) {
  return {
    onSubmit,
    ...render(<form onSubmit={onSubmit}>{ui}</form>),
  };
}

describe("EditImpactDialog", () => {
  it("renders a plain submit button when impactLines is null", () => {
    renderInForm(
      <EditImpactDialog
        impactLines={null}
        pending={false}
        label="Save changes"
      />,
    );
    const btn = screen.getByRole("button", { name: "Save changes" });
    expect(btn).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("renders a plain submit button when impactLines is empty", () => {
    renderInForm(
      <EditImpactDialog
        impactLines={[]}
        pending={false}
        label="Save changes"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).toHaveAttribute("type", "submit");
  });

  it("opens a dialog listing every line and does not submit until confirmed", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderInForm(
      <EditImpactDialog
        impactLines={[
          "3 customers have a card on this program.",
          "The goal moves from 8 to 10.",
        ]}
        pending={false}
        label="Save changes"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "3 customers have a card on this program.",
    );
    expect(dialog).toHaveTextContent("The goal moves from 8 to 10.");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await user.click(
      screen.getByRole("button", { name: /^(Save changes|Save)$/ }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

If the confirm button's accessible name collides with the trigger's ("Save changes" appears twice once the dialog is open), give the confirm action a distinct label ("Save the change") and assert on that. Decide this while implementing and keep the test in sync.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- edit-impact-dialog`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the implementation**

Create `src/app/setup/edit-impact-dialog.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

const SUBMIT_CLASS = "h-12 w-full rounded-xl text-base font-semibold";

export function EditImpactDialog({
  impactLines,
  pending,
  label,
}: {
  impactLines: string[] | null;
  pending: boolean;
  label: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!impactLines || impactLines.length === 0) {
    return (
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className={SUBMIT_CLASS}
      >
        {label}
      </Button>
    );
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="lg"
        disabled={pending}
        className={SUBMIT_CLASS}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save this change?</AlertDialogTitle>
            <div className="space-y-2 text-sm text-muted-foreground">
              {impactLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => triggerRef.current?.form?.requestSubmit()}
            >
              Save the change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

Note the cancel label is "Keep editing" and the confirm label is "Save the change" (distinct from the trigger's `label`, avoiding an accessible-name clash). Update the test's button-name assertions to match: cancel is `{ name: "Keep editing" }`, confirm is `{ name: "Save the change" }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- edit-impact-dialog`
Expected: PASS.

- [ ] **Step 5: Update docs**

- `src/app/setup/README.md`: add a `Contents` bullet:
  `- \`edit-impact-dialog.tsx\` — submit-button wrapper: a plain submit when there is nothing to warn about, otherwise a button that first opens an \`AlertDialog\` listing what current cardholders will see, and only submits the form on confirm`

- [ ] **Step 6: Commit**

```bash
git add src/app/setup/edit-impact-dialog.tsx src/app/setup/edit-impact-dialog.dom.test.tsx src/app/setup/README.md
git commit -m "feat(setup): EditImpactDialog submit wrapper"
```

---

### Task 4: Wire the dialog into the setup form

**Files:**

- Modify: `src/app/setup/setup-form.tsx`, `src/app/setup/page.tsx`, `src/app/setup/setup-form.dom.test.tsx`, `src/app/setup/README.md`, `CHANGELOG.md`

**Interfaces:**

- Consumes:
  - `isProgressAffecting`, `describeEditImpact`, `type ProgramSnapshot` from `@/lib/program-edit-impact` (Task 1)
  - `programCardCount(programId: string): Promise<number>` from `@/lib/cards` (Task 2)
  - `EditImpactDialog` from `@/app/setup/edit-impact-dialog` (Task 3)
- Produces: `SetupForm` gains an optional `cardCount?: number` prop (default `0`).

**Context:**

- `setup-form.tsx` already holds this state: `type` (`ProgramType`), `stampsRequired` (number), `visitsToBloom` (number), `pityCeiling` (number | undefined), `rewardText` (string), plus `isEdit`, `program`, `pending` (from `useActionState`).
- Resolved goal per type, matching `buildProgramFields` in `src/lib/program.ts`: `stamp` -> `stampsRequired`; `plant` -> `visitsToBloom`; `lucky`/`wheel`/`scratch` -> `pityCeiling ?? 10`. The `points` variant is a stamp-family type; treat it as `stampsRequired`.
- The submit `<Button type="submit" ...>` is near line 1400, inside `{isEdit ? "Save changes" : replacingId ? "Change type" : prepping ...}`.
- `page.tsx` renders `<SetupForm>` at two places (around lines 266 and 283). The `editing` variable (a `Program | null`) is already computed. `page.tsx` is an async server component.

- [ ] **Step 1: Write the failing test**

In `src/app/setup/setup-form.dom.test.tsx`, add a block. Follow the file's existing render helper and its `fireEvent`-over-`userEvent` preference where present (there is a documented flakiness caveat under coverage instrumentation):

```tsx
describe("SetupForm edit-impact dialog", () => {
  const stampProgram = {
    // spread whatever the file's existing program fixture factory returns
    ...makeProgram({
      type: "stamp",
      stamps_required: 8,
      reward_text: "Free coffee",
    }),
  };

  it("confirms before saving a stamp-goal change when customers hold cards", async () => {
    render(
      <SetupForm
        program={stampProgram}
        isEdit
        replacingId={null}
        replacingType={null}
        cardCount={3}
      />,
    );
    const goal = screen.getByLabelText(/stamps needed|stamps required/i);
    fireEvent.change(goal, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "3 customers have a card on this program.",
    );
  });

  it("saves with no dialog when the program has no cards", async () => {
    render(
      <SetupForm
        program={stampProgram}
        isEdit
        replacingId={null}
        replacingType={null}
        cardCount={0}
      />,
    );
    const goal = screen.getByLabelText(/stamps needed|stamps required/i);
    fireEvent.change(goal, { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
```

Match `makeProgram` / the label regex to what the file actually uses. If the existing fixture has no factory, build the object inline from the `Program` type in `@/lib/program`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- setup-form.dom`
Expected: FAIL (no `cardCount` prop / no dialog).

- [ ] **Step 3: Implement the wiring in `setup-form.tsx`**

1. Add imports:

```ts
import { EditImpactDialog } from "@/app/setup/edit-impact-dialog";
import {
  isProgressAffecting,
  describeEditImpact,
  type ProgramSnapshot,
} from "@/lib/program-edit-impact";
```

2. Add `cardCount = 0` to the destructured props and its type (`cardCount?: number`).

3. After the state declarations, derive the snapshots and lines:

```ts
const resolvedGoal =
  type === "plant"
    ? visitsToBloom
    : type === "lucky" || type === "wheel" || type === "scratch"
      ? (pityCeiling ?? 10)
      : stampsRequired;

const editImpactLines: string[] | null = (() => {
  if (!isEdit || !program || cardCount <= 0) return null;
  const before: ProgramSnapshot = {
    stamps_required: program.stamps_required,
    reward_text: program.reward_text,
  };
  const after: ProgramSnapshot = {
    stamps_required: resolvedGoal,
    reward_text: rewardText,
  };
  return isProgressAffecting(before, after)
    ? describeEditImpact(before, after, cardCount)
    : null;
})();
```

4. Replace the edit-mode submit button. The current block is one `<Button type="submit" ...>{isEdit ? "Save changes" : ...}</Button>`. Change it to:

```tsx
{isEdit ? (
  <EditImpactDialog
    impactLines={editImpactLines}
    pending={pending}
    label="Save changes"
  />
) : (
  <Button
    type="submit"
    size="lg"
    disabled={pending}
    className="h-12 w-full rounded-xl text-base font-semibold"
  >
    {replacingId ? "Change type" : prepping ? /* keep existing label */ : "Create card"}
  </Button>
)}
```

Preserve the exact non-edit label expression that is there now; only the `isEdit` branch moves into `EditImpactDialog`.

- [ ] **Step 4: Implement the prop pass-through in `page.tsx`**

1. Import: `import { programCardCount } from "@/lib/cards";`
2. Where `editing` is resolved, add:

```ts
const editingCardCount = editing ? await programCardCount(editing.id) : 0;
```

3. On the `<SetupForm>` render used for the `editing` case, add `cardCount={editingCardCount}`. Leave the other `<SetupForm>` render without the prop (defaults to 0).

- [ ] **Step 5: Run tests**

Run: `pnpm test -- setup-form.dom` then `pnpm test -- setup`
Expected: PASS. Re-run a failing userEvent case in isolation once before treating it as a real failure (documented flake).

- [ ] **Step 6: Typecheck + build**

Run: `pnpm check` then `pnpm build`
Expected: both exit 0. `pnpm build` catches a client/server boundary mistake (for example importing `programCardCount` into the client form by accident).

- [ ] **Step 7: Update docs**

- `src/app/setup/README.md`: update the `setup-form.tsx` and `page.tsx` bullets to mention the `cardCount` prop and that an edit which changes the stamp goal or reward wording on a program with cards now routes through `EditImpactDialog`.
- `CHANGELOG.md`: no new entry (Task 1 already covered this feature); only touch it if the wording there needs a tweak.

- [ ] **Step 8: Commit**

```bash
git add src/app/setup/setup-form.tsx src/app/setup/page.tsx src/app/setup/setup-form.dom.test.tsx src/app/setup/README.md
git commit -m "feat(setup): confirm goalpost-moving program edits"
```

---

### Task 5: 90-day reward-expiry default

**Files:**

- Create: `supabase/migrations/0046_loopkit_reward_expiry_default.sql`, `test/db/reward-expiry-default.test.ts`
- Modify: `src/app/setup/setup-form.tsx`, `src/app/setup/setup-form.dom.test.tsx`, `supabase/migrations/README.md`, `test/db/README.md`, `src/app/setup/README.md`, `CHANGELOG.md`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: no new code symbols. Behaviour: `create_program` RPC default `p_reward_expiry_days` becomes `90`; the setup form pre-fills the `reward_expiry_days` input with `90` for a new program.

**Context:**

- `supabase/migrations/0027_loopkit_reward_vouchers.sql` defines the current `loopkit.create_program`. Open it and copy the `create or replace function loopkit.create_program(...) ... $$;` block plus its trailing `grant execute on function loopkit.create_program(...)` **verbatim**. The `db` CI job actually runs every migration against a fresh Postgres, so the body must be valid and complete, not paraphrased.
- The only change from `0027`'s definition: the parameter line `p_reward_expiry_days int default null` becomes `p_reward_expiry_days int default 90`.
- Do not touch `grant_reward_voucher`, `record_stamp`, `redeem_voucher_by_token`, or any voucher-insert path. They already map `null` -> no expiry and `N` -> `now() + N days`, which stays correct.
- `setup-form.tsx` `reward_expiry_days` field is near line 1330: `<Input id="reward_expiry_days" name="reward_expiry_days" type="number" ... defaultValue={program?.reward_expiry_days ?? ""} />` with helper text "Leave blank so an earned reward never expires." The field only renders for the `stamp` type block.

- [ ] **Step 1: Write the failing test**

Create `test/db/reward-expiry-default.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0046_loopkit_reward_expiry_default.sql",
  "utf8",
);

describe("0046 reward expiry default", () => {
  it("re-creates loopkit.create_program", () => {
    expect(sql).toMatch(/create or replace function loopkit\.create_program/i);
  });

  it("defaults p_reward_expiry_days to 90", () => {
    expect(sql).toMatch(/p_reward_expiry_days\s+int\s+default\s+90/i);
  });

  it("does not backfill existing programs", () => {
    expect(sql).not.toMatch(
      /update\s+loopkit\.programs\s+set[\s\S]*reward_expiry_days/i,
    );
  });

  it("does not touch the voucher-granting functions", () => {
    expect(sql).not.toMatch(/grant_reward_voucher|redeem_voucher_by_token/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- reward-expiry-default`
Expected: FAIL, cannot read `0046_loopkit_reward_expiry_default.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0046_loopkit_reward_expiry_default.sql`. Structure (fill the body from `0027` verbatim):

```sql
-- Newly created programs default an earned reward's lifetime to 90 days.
-- null still means "never expires"; the vendor reaches it by clearing the
-- setup form's expiry field. No backfill: existing programs keep their value.

create or replace function loopkit.create_program(
  p_type               text,
  p_name               text,
  p_stamps_required    int,
  p_reward_text        text,
  p_config             jsonb,
  p_expiry_days        int default null,
  p_head_start         boolean default false,
  p_carry_over_stamps  boolean default false,
  p_active             boolean default true,
  p_head_start_percent int default 20,
  p_reward_expiry_days int default 90
)
returns uuid
language plpgsql security definer set search_path = '' as $$
-- ... COPY THE BODY FROM 0027 VERBATIM, from `declare` through the final `$$;`
$$;

grant execute on function loopkit.create_program(
  text, text, int, text, jsonb, int, boolean, boolean, boolean, int, int
) to authenticated;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- reward-expiry-default`
Expected: PASS.

- [ ] **Step 5: Apply the migration locally and check it loads**

Run: `/supabase-migrate` (or `pnpm supabase db reset` if that is the project's local flow)
Expected: all migrations apply with no error; `create_program` still callable. If `/supabase-migrate` regenerates `src/lib/types.ts`, review the diff: a parameter default is not in the generated types, so expect no change. Commit a types change only if one genuinely appears.

- [ ] **Step 6: Change the form default + copy**

In `setup-form.tsx`, the `reward_expiry_days` `<Input>`:

- `defaultValue={isEdit ? (program?.reward_expiry_days ?? "") : 90}`
- Helper `<p>` text: `Pre-filled to 90 days. Clear the box if you want earned rewards to never expire.`

(`replacingId` / `prepping` are new-program flows, so `isEdit` is false for them and they get `90`. Confirmed by the existing action wiring: `changeTypeAction` / `prepProgramAction` both create.)

- [ ] **Step 7: Add the form default test**

In `setup-form.dom.test.tsx`, add:

```tsx
describe("SetupForm reward expiry default", () => {
  it("pre-fills 90 days for a new stamp program", () => {
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    // navigate the form to the stamp type / basics step if the field is gated
    expect(screen.getByLabelText(/reward.*expire|expiry/i)).toHaveValue(90);
  });

  it("shows the existing value (blank when null) when editing", () => {
    render(
      <SetupForm
        program={makeProgram({ type: "stamp", reward_expiry_days: null })}
        isEdit
        replacingId={null}
        replacingType={null}
      />,
    );
    expect(screen.getByLabelText(/reward.*expire|expiry/i)).toHaveValue(null);
  });
});
```

Match the label matcher and step navigation to the file's existing patterns (other tests in this file already reach the stamp fields; copy their setup).

- [ ] **Step 8: Run tests + build**

Run: `pnpm test -- setup-form.dom` then `pnpm check` then `pnpm build`
Expected: all green.

- [ ] **Step 9: Update docs**

- `supabase/migrations/README.md`: add a `0046` line:
  `- \`0046_loopkit_reward_expiry_default.sql\` — \`create_program\` now defaults \`p_reward_expiry_days\` to 90 (was null). null still means "never expires"; no backfill, no change to the voucher-grant path.`
- `test/db/README.md`: add a bullet:
  `- \`reward-expiry-default.test.ts\` — static check that \`0046\` re-creates \`create_program\` with \`p_reward_expiry_days int default 90\`, backfills nothing, and does not touch the voucher-grant functions`
- `src/app/setup/README.md`: update the `setup-form.tsx` bullet to note the expiry field pre-fills 90 for new programs.
- `CHANGELOG.md`, under `## [Unreleased]` `### Changed`:
  `- Rewards a customer earns now expire 90 days after being granted by default. A vendor who wants a reward to never expire clears the expiry field when setting up the card. Existing programs are unchanged.`

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0046_loopkit_reward_expiry_default.sql test/db/reward-expiry-default.test.ts src/app/setup/setup-form.tsx src/app/setup/setup-form.dom.test.tsx supabase/migrations/README.md test/db/README.md src/app/setup/README.md CHANGELOG.md
git commit -m "feat(setup): default earned-reward expiry to 90 days"
```

---

### Task 6: Full verification + PR

**Files:** none (verification only), plus `docs/superpowers/plans/README.md` if the plan file needs indexing.

- [ ] **Step 1: Full local gate**

Run in order:

```bash
pnpm check
pnpm test
pnpm build
```

Expected: `check` exit 0; `test` all pass (note the test count went up by roughly the new specs); `build` exit 0.

- [ ] **Step 2: Confirm the readme-freshness set**

Run: `git diff --name-only main...HEAD`
For every changed non-README path, confirm that folder's `README.md` is also in the list. Folders expected: `src/lib/`, `src/app/setup/`, `test/lib/`, `test/db/`, `supabase/migrations/`, `docs/superpowers/specs/` (from the spec commits), `docs/superpowers/plans/` (this file), root. Add any missing `README.md` touch now.

- [ ] **Step 3: Confirm the plan file is indexed**

If `docs/superpowers/plans/README.md` has a per-file list, add:
`- \`2026-09-09-program-edit-safety.md\` — edit-impact confirmation dialog (Part 1) + 90-day \`create_program\` reward-expiry default (Part 2), from the same-dated spec`Commit:`git add docs/superpowers/plans/ && git commit -m "docs: index the program-edit-safety plan"`

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin feat/program-edit-safety
gh pr create --title "feat(setup): program edit-impact dialog + 90-day reward expiry default" --body "$(cat <<'EOF'
## What

Two gaps left after the vendor-dashboard redesign.

**Part 1: edit-impact confirmation.** Changing a card's stamp goal or reward
wording while customers already hold cards now pops an AlertDialog spelling
out that existing stamps are kept and only new rewards use the new wording.
Non-progress edits and zero-card programs save silently as before. Pure
helper `src/lib/program-edit-impact.ts`, client-only dialog, no server
action change.

**Part 2: 90-day reward expiry default.** `create_program` now defaults
`p_reward_expiry_days` to 90 (migration `0046`); the setup form pre-fills 90
for new programs. `null` still means "never expires", reached by clearing
the field. No backfill, no change to the voucher-grant path.

Spec: `docs/superpowers/specs/2026-09-09-program-edit-safety-design.md`
Plan: `docs/superpowers/plans/2026-09-09-program-edit-safety.md`

Archive / Replace were found to already exist (`programs.replaced_by`,
`?migrate=`) and are out of scope.

## Test

- `pnpm check` / `pnpm test` / `pnpm build` all green locally
- new: `program-edit-impact` unit tests, `programCardCount` tests,
  `edit-impact-dialog` DOM tests, `setup-form` dialog + expiry-default DOM
  tests, `0046` static SQL test

## After merge

Apply `0046` to prod (`/supabase-migrate` or manual), then check
`src/lib/types.ts` (no change expected: a parameter default is not in the
generated types).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Watch CI**

Run: `gh pr checks --watch`
Expected: `check + unit`, `build`, `e2e (public smoke)`, `db (migrations + pgTAP RLS)`, `readme-freshness`, `changelog`, `comment-hygiene`, `dependency audit`, `secret scan` all green. `mutation (changed lib)` is advisory (may hang; cancel it if it exceeds ~10 min and core checks are green, per prior runs). Fix any red core check before merge.

---

## Self-Review

**1. Spec coverage:**

- Part 1 trigger (edit mode + progress-affecting + cardCount > 0): Task 4 `editImpactLines` guard. ✓
- Part 1 "progress-affecting" = stamps_required or reward_text: Task 1 `isProgressAffecting`. ✓
- Part 1 dialog contents (intro line, goal up/down, reward wording): Task 1 `describeEditImpact` + Task 3 renders them. ✓
- Part 1 wiring (`program-edit-impact.ts`, `edit-impact-dialog.tsx`, `setup-form.tsx`, `programCardCount`, `page.tsx`): Tasks 1-4. ✓
- Part 1 "no server change": Tasks 4 touches only the client form + the server component's prop pass. ✓
- Part 2 form pre-fill 90 / edit shows current: Task 5 Step 6. ✓
- Part 2 `create_program` default 90, migration `0046`, re-grant: Task 5 Step 3. ✓
- Part 2 no backfill, no grant-path change: Task 5 Step 3 + its static test. ✓
- Testing sections: Tasks 1, 2, 3, 4, 5 each carry the spec's named tests. ✓
- File-change summary: every file in the spec's list has a task. ✓

**2. Placeholder scan:** One deliberate `/* keep existing label */` marker in Task 4 Step 3 for the non-edit button's `prepping` label, with an instruction to preserve the current expression. No TBD/TODO. Test helper names (`makeProgram`, `mockCreateServerClient`) are flagged as "match the file's actual pattern" because the exact fixture style is file-local. Acceptable: the implementer reads the file.

**3. Type consistency:** `ProgramSnapshot` = `{ stamps_required: number; reward_text: string }` in Task 1, consumed unchanged in Task 4. `programCardCount(programId: string): Promise<number>` in Task 2, called as `await programCardCount(editing.id)` in Task 4. `EditImpactDialog` props `{ impactLines: string[] | null; pending: boolean; label: React.ReactNode }` in Task 3, used with those exact props in Task 4. `cardCount` prop name consistent across Tasks 4 and the spec. ✓
