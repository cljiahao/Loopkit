# /setup width fix + card details split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen `/setup` to match `/dashboard/profile`'s scale, move the outer column split from `sm:` to `md:` (fixing the inner field-pair row-break bug), and split the "Card details" form into two `Card` components ("Basics", "Rules") matching the profile page's header pattern.

**Architecture:** Two file changes — `src/app/setup/page.tsx`'s width classes, and `src/app/setup/setup-form.tsx`'s breakpoint + JSX restructure into two `Card`s. No field logic, validation, or server action changes.

**Tech Stack:** Next.js 16 App Router, React (`"use client"`), TypeScript strict, Tailwind v4, shadcn/ui `Card` (already installed, used by `/dashboard/profile`), Vitest + Testing Library (jsdom).

## Global Constraints

- `/setup`'s `<main>` wrapper moves from `max-w-md sm:max-w-2xl` to `max-w-lg md:max-w-4xl` — the exact scale `/dashboard/profile` uses. No other change to `<main>`'s classes.
- `SetupForm`'s outer wrapper grid moves from `sm:grid-cols-2 sm:items-start` to `md:grid-cols-2 md:items-start`. The inner field-pair grids (`sm:grid-cols-2` on stamp/plant/streak/lucky field pairs) are NOT touched — the width fix works by giving them room again, not by changing their own breakpoint.
- Right column splits into two `Card`s: "Basics" (icon `Tag`, eyebrow "Every card needs this", description "The name and reward customers see.") holding name + type-specific field block + reward text; "Rules" (icon `SlidersHorizontal`, eyebrow "How it works", description "Head start, carry-over, and how long a card lasts.") holding head-start toggle, carry-over toggle, expiry, error message, submit button.
- `<form>` wraps both cards — the hidden `id`/`replacing`/`type` inputs stay at the top of `<form>`, outside either card.
- No change to any field's `name`, `id`, validation, or the server actions — this is a pure layout/JSX-nesting change.
- Every task's commit must leave `pnpm check` clean, the full `pnpm test` suite passing, and `pnpm build` clean (this file is reachable from a Client Component — always verify with an actual build, not just check/test).

---

### Task 1: Widen /setup and split card details into two Cards

**Files:**

- Modify: `src/app/setup/page.tsx`
- Modify: `src/app/setup/setup-form.tsx`
- Modify: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` from `@/components/ui/card` (already installed — used by `src/app/dashboard/profile/profile-form.tsx`); `Tag`, `SlidersHorizontal` from `lucide-react`.
- Produces: no new exports — this task only changes `SetupForm`'s returned JSX and `page.tsx`'s `<main>` className.

- [ ] **Step 1: Update the failing test**

In `src/app/setup/setup-form.dom.test.tsx`, replace this test:

```tsx
it("shows both section headings, type picker and preview in the left column", () => {
  render(
    <SetupForm
      program={null}
      isEdit={false}
      replacingId={null}
      replacingType={null}
    />,
  );
  expect(screen.getByText("Choose a card type")).toBeInTheDocument();
  expect(screen.getByText("Card details")).toBeInTheDocument();
});
```

with:

```tsx
it("shows the type-picker heading and both card-details cards", () => {
  render(
    <SetupForm
      program={null}
      isEdit={false}
      replacingId={null}
      replacingType={null}
    />,
  );
  expect(screen.getByText("Choose a card type")).toBeInTheDocument();
  expect(screen.getByText("Basics")).toBeInTheDocument();
  expect(screen.getByText("Rules")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: FAIL — `screen.getByText("Basics")` finds nothing (the two-card split doesn't exist yet).

- [ ] **Step 3: Widen the page wrapper**

In `src/app/setup/page.tsx`, replace:

```tsx
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-5 sm:max-w-2xl">
```

with:

```tsx
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-5 md:max-w-4xl">
```

- [ ] **Step 4: Add the Card and icon imports**

In `src/app/setup/setup-form.tsx`, add to the existing imports:

```ts
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tag, SlidersHorizontal } from "lucide-react";
```

- [ ] **Step 5: Restructure the returned JSX into two Cards**

Replace the entire return statement (from `return (` through the final `);` and closing `}`) with:

```tsx
  return (
    <div className="mt-7 grid grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
      <div className="space-y-4">
        <h3 className={labelClass}>Choose a card type</h3>
        {isEdit ? (
          <p className="flex h-11 items-center rounded-xl border bg-muted/40 px-3 text-sm font-semibold text-muted-foreground">
            {typeLabels[type]}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                onClick={() => pickType(option.value)}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left transition-colors",
                  type === option.value
                    ? "border-primary bg-primary/10"
                    : "bg-card hover:bg-muted/50",
                )}
              >
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </button>
            ))}
          </div>
        )}
        <PreviewCard
          progress={previewProgress}
          name={name}
          rewardText={rewardText}
        />
      </div>

      <form action={formAction} className="space-y-6">
        {program ? <input type="hidden" name="id" value={program.id} /> : null}
        {replacingId ? (
          <input type="hidden" name="replacing" value={replacingId} />
        ) : null}
        <input type="hidden" name="type" value={type} />

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Tag className="size-4" />
              </span>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Every card needs this
                </p>
                <CardTitle className="mt-0.5 text-lg">Basics</CardTitle>
                <CardDescription className="mt-1">
                  The name and reward customers see.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {type === "stamp" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className={labelClass}>
                    Card name
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    required
                    maxLength={60}
                    placeholder="Coffee card"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stamps_required" className={labelClass}>
                    Stamps required
                  </Label>
                  <Input
                    id="stamps_required"
                    name="stamps_required"
                    type="number"
                    required
                    min={2}
                    max={20}
                    placeholder="10"
                    value={stampsRequired}
                    onChange={(e) => setStampsRequired(Number(e.target.value))}
                    className="h-11 rounded-xl"
                  />
                  <div className="flex gap-1.5">
                    {[5, 10, 15].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setStampsRequired(n)}
                        className={cn(
                          "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                          stampsRequired === n
                            ? "border-primary bg-primary/10 text-primary"
                            : "bg-card text-muted-foreground hover:bg-muted/50",
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : type === "plant" ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className={labelClass}>
                    Card name
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    required
                    maxLength={60}
                    placeholder="Grow-a-kopi"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visits_to_bloom" className={labelClass}>
                    Visits to bloom
                  </Label>
                  <Input
                    id="visits_to_bloom"
                    name="visits_to_bloom"
                    type="number"
                    required
                    min={4}
                    max={20}
                    placeholder="6"
                    value={visitsToBloom}
                    onChange={(e) => setVisitsToBloom(Number(e.target.value))}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name" className={labelClass}>
                    Card name
                  </Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    required
                    maxLength={60}
                    placeholder={
                      type === "lucky"
                        ? "Lucky topping"
                        : type === "wheel"
                          ? "Spin to win"
                          : type === "scratch"
                            ? "Scratch & win"
                            : "Weekly regular"
                    }
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>

                {type === "streak" ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="period_days" className={labelClass}>
                        Days per streak window
                      </Label>
                      <Input
                        id="period_days"
                        name="period_days"
                        type="number"
                        required
                        min={1}
                        max={30}
                        placeholder="7"
                        value={periodDays}
                        onChange={(e) => setPeriodDays(Number(e.target.value))}
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="target_streak" className={labelClass}>
                        Streak length to earn reward
                      </Label>
                      <Input
                        id="target_streak"
                        name="target_streak"
                        type="number"
                        required
                        min={2}
                        max={20}
                        placeholder="4"
                        value={targetStreak}
                        onChange={(e) => setTargetStreak(Number(e.target.value))}
                        className="h-11 rounded-xl"
                      />
                    </div>
                  </div>
                ) : type === "wheel" || type === "scratch" ? (
                  <>
                    <div className="space-y-2">
                      <Label className={labelClass}>
                        {type === "wheel" ? "Wheel segments" : "Scratch prizes"}
                      </Label>
                      <div className="space-y-2">
                        {segments.map((segment, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              type="text"
                              required
                              maxLength={40}
                              value={segment.label}
                              onChange={(e) =>
                                updateSegment(i, { label: e.target.value })
                              }
                              placeholder="Label"
                              className="h-11 flex-1 rounded-xl"
                            />
                            <Input
                              type="number"
                              required
                              min={1}
                              max={100}
                              value={segment.weight}
                              onChange={(e) =>
                                updateSegment(i, {
                                  weight: Number(e.target.value),
                                })
                              }
                              aria-label="Odds weight"
                              title="Odds weight — higher numbers land more often relative to the other prizes"
                              className="h-11 w-20 rounded-xl"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateSegment(i, {
                                  is_reward: !segment.is_reward,
                                })
                              }
                              className={cn(
                                "h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition-colors",
                                segment.is_reward
                                  ? "border-gold bg-gold/10 text-gold-accent"
                                  : "bg-card text-muted-foreground hover:bg-muted/50",
                              )}
                            >
                              {segment.is_reward ? "Reward" : "No win"}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSegment(i)}
                              disabled={segments.length <= 2}
                              className="h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={addSegment}
                        disabled={segments.length >= 6}
                        className="h-11 w-full rounded-xl border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-40"
                      >
                        Add segment
                      </button>
                      <input
                        type="hidden"
                        name="segments"
                        value={JSON.stringify(segments)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pity_ceiling" className={labelClass}>
                        Guaranteed win by (optional)
                      </Label>
                      <Input
                        id="pity_ceiling"
                        name="pity_ceiling"
                        type="number"
                        min={2}
                        max={20}
                        placeholder="No guarantee"
                        value={pityCeiling ?? ""}
                        onChange={(e) =>
                          setPityCeiling(
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                          )
                        }
                        className="h-11 rounded-xl"
                      />
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="win_percent" className={labelClass}>
                        Win chance (%)
                      </Label>
                      <Input
                        id="win_percent"
                        name="win_percent"
                        type="number"
                        required
                        min={2}
                        max={100}
                        placeholder="20"
                        value={winPercent}
                        onChange={(e) => setWinPercent(Number(e.target.value))}
                        className="h-11 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pity_ceiling" className={labelClass}>
                        Guaranteed win by
                      </Label>
                      <Input
                        id="pity_ceiling"
                        name="pity_ceiling"
                        type="number"
                        required
                        min={2}
                        max={20}
                        placeholder="8"
                        value={pityCeiling ?? 8}
                        onChange={(e) => setPityCeiling(Number(e.target.value))}
                        className="h-11 rounded-xl"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="reward_text" className={labelClass}>
                Reward
              </Label>
              <Input
                id="reward_text"
                name="reward_text"
                type="text"
                required
                maxLength={80}
                placeholder="Free kopi"
                value={rewardText}
                onChange={(e) => setRewardText(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <SlidersHorizontal className="size-4" />
              </span>
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  How it works
                </p>
                <CardTitle className="mt-0.5 text-lg">Rules</CardTitle>
                <CardDescription className="mt-1">
                  Head start, carry-over, and how long a card lasts.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {(type === "stamp" || type === "plant" || type === "streak") && (
              <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
                <Switch
                  id="head_start_checkbox"
                  checked={headStart}
                  onCheckedChange={setHeadStart}
                  className="mt-0.5"
                />
                <label htmlFor="head_start_checkbox" className="text-sm">
                  <span className="font-medium">
                    Give new customers a head start
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    New signups start with a small amount of free progress
                    toward their first reward — shown to measurably increase
                    completion.
                  </span>
                </label>
                <input
                  type="hidden"
                  name="head_start"
                  value={headStart ? "true" : "false"}
                />
              </div>
            )}

            {showCarryOverOption && (
              <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3">
                <Switch
                  id="carry_over_stamps_checkbox"
                  checked={carryOverStamps}
                  onCheckedChange={setCarryOverStamps}
                  className="mt-0.5"
                />
                <label htmlFor="carry_over_stamps_checkbox" className="text-sm">
                  <span className="font-medium">
                    Carry over customers&apos; current stamp count onto the
                    new card
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Left unchecked, everyone starts the new card from zero.
                  </span>
                </label>
                <input
                  type="hidden"
                  name="carry_over_stamps"
                  value={carryOverStamps ? "true" : "false"}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="expiry_days" className={labelClass}>
                Card expires after (days, optional)
              </Label>
              <Input
                id="expiry_days"
                name="expiry_days"
                type="number"
                min={1}
                max={3650}
                placeholder="Never expires"
                defaultValue={program?.expiry_days ?? ""}
                className="h-11 rounded-xl"
              />
              <p className="text-xs text-muted-foreground">
                Counted from each customer&apos;s current cycle — resets
                whenever their card is regenerated. Leave blank for a card
                that never expires.
              </p>
            </div>

            {state.error ? (
              <p className="text-sm font-medium text-destructive">
                {state.error}
              </p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="h-12 w-full rounded-xl text-base font-semibold"
            >
              {isEdit
                ? "Save changes"
                : replacingId
                  ? "Change type"
                  : prepping
                    ? "Save as draft"
                    : "Create card"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
```

(Every field's `id`/`name`/`value`/`onChange` is byte-identical to before — only the surrounding JSX structure changed: the standalone `<h3>Card details</h3>` heading is gone, replaced by the two cards' own `CardTitle`s; `<form>`'s className changed from `space-y-5` to `space-y-6` to space the two cards apart, matching each `CardContent`'s own `space-y-5` for its internal fields — same visual rhythm as before, just two levels of grouping instead of one flat list.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS — all 8 tests (the 7 unchanged ones plus the updated Step 1 test).

- [ ] **Step 7: Run the full check, test suite, and build**

Run: `pnpm check && pnpm test && pnpm build`
Expected: all three clean/passing.

- [ ] **Step 8: Commit**

```bash
git add src/app/setup/page.tsx src/app/setup/setup-form.tsx src/app/setup/setup-form.dom.test.tsx
git commit -m "feat: widen /setup and split card details into Basics/Rules cards"
```

## Self-Review Notes

- **Spec coverage:** Section A (page.tsx width) → Step 3. Section B (setup-form.tsx breakpoint + card split) → Steps 4-5. Testing section → Steps 1-2, 6. All covered. The spec's "wheel/scratch segment row gets room from the width fix, no separate restructuring" claim needs no dedicated task since it's a consequence of the width fix, not new code.
- **Placeholder scan:** none — every step shows complete code; the one parenthetical note after Step 5 is documentation of what changed, not a placeholder for missing code (the actual code block above it is complete and unabridged).
- **Type consistency:** every field's `value`/`onChange`/state-setter name (`stampsRequired`/`setStampsRequired`, `pityCeiling`/`setPityCeiling`, etc.) matches exactly what already exists in the file from the prior redesign — no renames.
