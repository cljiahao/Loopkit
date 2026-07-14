# Dashboard Card Readability + Profile Page Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dashboard program cards more readable (3-column cap, a short detail line) and bring the profile page to parity with qkit's layout (2-column masonry, a new Display name field).

**Architecture:** Two fully independent tasks, disjoint files, no shared setup. Task 1 adds a pure helper function (`programDetails`) to the existing `program-display.ts` and renders its output in `ProgramCard`, plus a one-line grid class change on the dashboard page. Task 2 adds a new client-side-only field to the existing profile form (no new server action, no migration) and changes its layout wrapper class.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4, shadcn/ui, Vitest + Testing Library (jsdom for components, plain node tests for pure `lib`/`display` helpers), pnpm.

## Global Constraints

- Keep the codebase clean: no leftover unused code, no stale comments referencing removed behavior.
- Every task's commit must leave `pnpm check` (prettier + eslint + tsc) clean.
- Task 1: no live/queried stat data on `ProgramCard` — `programDetails` must be a pure function of fields already present on the `Program` type passed into the component, no new Supabase query anywhere in this task.
- Task 2: no new server action, no DB migration — the Display name field is saved via the existing client-side `supabase.auth.updateUser({ data: { display_name } })` call pattern already used for the Photo card's `avatar_url`. `display_name` must not be read or passed into `DashboardNav` or any other component — it stays private to the profile page.
- Task 2's new Card uses loopkit's own already-installed shadcn `Card`/`CardHeader`/`CardTitle`/`CardContent` (`@/components/ui/card`) — not qkit's `Section` component, which is not a shadcn primitive and does not exist in this repo.

---

### Task 1: Dashboard card detail line + 3-column grid cap

**Files:**

- Modify: `src/app/dashboard/program-display.ts`
- Modify: `src/app/dashboard/program-display.test.ts`
- Modify: `src/app/dashboard/program-card.tsx`
- Modify: `src/app/dashboard/program-card.dom.test.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**

- Produces: `programDetails(program: { expiry_days?: number | null; head_start: boolean }): string[]` in `src/app/dashboard/program-display.ts`, exported alongside the existing `describeProgram`.

- [ ] **Step 1: Write the failing test for `programDetails`**

Append to `src/app/dashboard/program-display.test.ts` (add this new `describe` block after the existing `describeProgram` block, keep the existing `import` line but add `programDetails` to it):

```ts
import {
  PROGRAM_TYPE_BADGE,
  describeProgram,
  programDetails,
} from "./program-display";
```

```ts
describe("programDetails", () => {
  it("shows 'Never expires' when expiry_days is null", () => {
    expect(programDetails({ expiry_days: null, head_start: false })).toEqual([
      "Never expires",
    ]);
  });

  it("shows the reset window when expiry_days is set", () => {
    expect(programDetails({ expiry_days: 30, head_start: false })).toEqual([
      "Resets after 30 days",
    ]);
  });

  it("adds a head-start note when head_start is true", () => {
    expect(programDetails({ expiry_days: null, head_start: true })).toEqual([
      "Never expires",
      "New customers get a head start",
    ]);
  });

  it("combines a reset window and head-start note", () => {
    expect(programDetails({ expiry_days: 14, head_start: true })).toEqual([
      "Resets after 14 days",
      "New customers get a head start",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test program-display.test.ts`
Expected: FAIL with "programDetails is not a function" (or a TypeScript import error, since `programDetails` doesn't exist in `program-display.ts` yet).

- [ ] **Step 3: Write minimal implementation**

In `src/app/dashboard/program-display.ts`, add this function after `describeProgram` (keep everything else in the file unchanged):

```ts
type DetailableProgram = {
  expiry_days?: number | null;
  head_start: boolean;
};

// Short supplementary detail line(s) for the dashboard card, below the
// one-line describeProgram() blurb. Pure — built only from fields already
// on the program row, no new query.
export function programDetails(program: DetailableProgram): string[] {
  const details: string[] = [];
  details.push(
    program.expiry_days
      ? `Resets after ${program.expiry_days} days`
      : "Never expires",
  );
  if (program.head_start) {
    details.push("New customers get a head start");
  }
  return details;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test program-display.test.ts`
Expected: PASS (all `describeProgram` tests plus the 4 new `programDetails` tests)

- [ ] **Step 5: Write the failing test for `ProgramCard` rendering the detail line**

Add this test to `src/app/dashboard/program-card.dom.test.tsx`, inside the existing `describe("ProgramCard", ...)` block (after the "renders the program name..." test):

```tsx
it("renders the expiry and head-start detail lines", () => {
  const withDetails: Program = {
    ...program,
    expiry_days: 30,
    head_start: true,
  };
  render(<ProgramCard program={withDetails} />);
  expect(screen.getByText("Resets after 30 days")).toBeInTheDocument();
  expect(
    screen.getByText("New customers get a head start"),
  ).toBeInTheDocument();
});

it("shows 'Never expires' when there is no expiry", () => {
  render(<ProgramCard program={program} />);
  expect(screen.getByText("Never expires")).toBeInTheDocument();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test program-card.dom.test.tsx`
Expected: FAIL — neither "Resets after 30 days" nor "Never expires" is rendered by the current `ProgramCard`.

- [ ] **Step 7: Write minimal implementation**

In `src/app/dashboard/program-card.tsx`:

1. Add `programDetails` to the existing import from `./program-display`:

```tsx
import {
  PROGRAM_TYPE_BADGE,
  describeProgram,
  programDetails,
} from "./program-display";
```

2. Replace the description `<p>` block:

```tsx
<p className="mt-1 text-xs text-muted-foreground">{describeProgram(program)}</p>
```

with:

```tsx
          <p className="mt-1 text-xs text-muted-foreground">
            {describeProgram(program)}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {programDetails(program).map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm test program-card.dom.test.tsx`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 9: Change the dashboard grid to cap at 3 columns**

In `src/app/dashboard/page.tsx`, change:

```tsx
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
```

to:

```tsx
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
```

- [ ] **Step 10: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: All pass.

- [ ] **Step 11: Commit**

```bash
git add src/app/dashboard/program-display.ts src/app/dashboard/program-display.test.ts src/app/dashboard/program-card.tsx src/app/dashboard/program-card.dom.test.tsx src/app/dashboard/page.tsx
git commit -m "feat: add card detail line and cap dashboard grid at 3 columns"
```

---

### Task 2: Profile page — Display name field + 2-column layout

**Files:**

- Modify: `src/app/dashboard/profile/page.tsx`
- Modify: `src/app/dashboard/profile/profile-form.tsx`

**Interfaces:**

- No new exported functions or server actions. `ProfileForm`'s props gain one new required field: `displayName: string`.

`profile-form.tsx` has no existing test file in this repo (confirmed — no `profile-form.dom.test.tsx` or similar exists), matching this session's established precedent of no dedicated test for comparable form components (`setup-form.tsx` was left untested for the same reason in an earlier task this session). No test file is created or expected for this task.

- [ ] **Step 1: Read `display_name` in the page and pass it through**

In `src/app/dashboard/profile/page.tsx`, add after the existing `const { user } = await requireVendor();` line:

```tsx
const rawDisplayName = user.user_metadata?.display_name;
const displayName = typeof rawDisplayName === "string" ? rawDisplayName : "";
```

Change the `<main>` wrapper's className from:

```tsx
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
```

to:

```tsx
    <main className="mx-auto max-w-lg space-y-8 p-5 py-10 md:max-w-4xl">
```

Add `displayName={displayName}` as a new prop on the `<ProfileForm>` call, alongside the existing `vendorId`/`email`/`name`/`avatarUrl` props:

```tsx
<ProfileForm
  vendorId={user.id}
  email={user.email ?? ""}
  name={profile.name}
  avatarUrl={user.user_metadata?.avatar_url ?? null}
  displayName={displayName}
/>
```

- [ ] **Step 2: Add the `displayName` prop and state to `ProfileForm`**

In `src/app/dashboard/profile/profile-form.tsx`, change the `Props` interface:

```tsx
interface Props {
  vendorId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
```

to:

```tsx
interface Props {
  vendorId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  displayName: string;
}
```

Change the function signature:

```tsx
export function ProfileForm({ vendorId, email, name, avatarUrl }: Props) {
```

to:

```tsx
export function ProfileForm({
  vendorId,
  email,
  name,
  avatarUrl,
  displayName,
}: Props) {
```

Add new state, right after the existing `const [avatar, setAvatar] = useState(avatarUrl);` block (before the "Password" comment/state block):

```tsx
// Display name — private, decorative only (not shown anywhere else in
// the app). Persisted the same way avatar_url already is: directly on
// the auth user via the browser client, no server action needed.
const initialDisplayName = displayName;
const [display, setDisplay] = useState(initialDisplayName);
const { pending: savingDisplay, run: runDisplay } = useAsyncAction();
```

- [ ] **Step 3: Add the `saveDisplayName` handler**

In `src/app/dashboard/profile/profile-form.tsx`, add this function after the existing `handleAvatarChange` function (before `savePassword`):

```tsx
function saveDisplayName() {
  return runDisplay(async () => {
    const trimmed = display.trim().slice(0, 60);
    const { error } = await supabase.auth.updateUser({
      data: { display_name: trimmed },
    });
    if (error) {
      toast.error("Couldn't save your display name. Try again.");
      return;
    }
    setDisplay(trimmed);
    toast.success("Display name saved");
    router.refresh();
  });
}
```

- [ ] **Step 4: Add the Display name Card and switch to the 2-column layout**

In `src/app/dashboard/profile/profile-form.tsx`, change the outer wrapper's className from:

```tsx
    <div className="space-y-5">
```

to:

```tsx
    <div className="md:columns-2 md:gap-5 [&>*]:mb-5 [&>*]:break-inside-avoid-column">
```

Insert a new `<Card>` block between the existing "Photo" `<Card>` and "Change password" `<Card>`:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Display name</CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="space-y-2">
      <Label htmlFor="display-name" className={labelClass}>
        Display name
      </Label>
      <Input
        id="display-name"
        value={display}
        maxLength={60}
        onChange={(e) => setDisplay(e.target.value)}
        placeholder="e.g. Aisha"
        className="h-11 rounded-xl"
      />
      <p className="text-xs text-muted-foreground">
        How we address you. Customers never see this.
      </p>
    </div>
    <div className="flex justify-end">
      <Button
        type="button"
        onClick={saveDisplayName}
        disabled={savingDisplay || display.trim() === initialDisplayName.trim()}
        className="h-10 rounded-xl font-semibold"
      >
        {savingDisplay ? "Saving…" : "Save"}
      </Button>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: All pass — no existing test targets `profile-form.tsx`, so this step confirms nothing else broke.

- [ ] **Step 6: Manually verify in the running app**

Run: `pnpm dev`, go to `/dashboard/profile`. Confirm: 4 cards (Stall name, Photo, Display name, Change password) render, the page lays out as 2 columns at tablet+ width and 1 column on mobile, entering a display name and clicking Save persists it (reload the page and confirm it's still there), and the Save button is disabled when the field is unchanged from its saved value.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/profile/page.tsx src/app/dashboard/profile/profile-form.tsx
git commit -m "feat: add Display name field and 2-column layout to profile page"
```
