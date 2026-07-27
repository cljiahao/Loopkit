# Stamp Cards — Logo or Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a vendor mark a plain-dot stamp card with a preset icon (gift/coffee/star/heart) or their own profile photo instead of a generic dot, opt-in per program.

**Architecture:** A new `stamp_mark: { mode, preset? }` field lives in the stamp program's existing `config` JSON blob (matching the `points_per_visit` precedent — no migration for this part). The engine's `dots` progress view carries `markMode`/`markPreset` through unchanged; resolving "photo" mode to an actual URL happens at the two render call sites (`/c` and `/setup`), since the vendor's `avatar_url` lives in Supabase Auth user metadata, not program config. `/setup` already has the signed-in vendor's `user` object server-side (zero new fetch). `/c` is unauthenticated and only has a `vendorId`, so its one DB-touching change is a small migration: append a `vendor_avatar_url` column to the existing `vendor_join` RPC's return table (the same public information already served by the public-read `vendor-images` bucket).

**Tech Stack:** TypeScript, React 19, Zod, Supabase (`@supabase/ssr`), Tailwind v4, lucide-react, Vitest + Testing Library (jsdom).

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at the Server Action boundary.
- No new Storage bucket, no new RLS policy — the `vendor-images` bucket and its policies (`0017_loopkit_vendor_profile.sql`) already cover this.
- This is opt-in per program, not automatic reuse of the vendor's profile photo — a vendor must explicitly pick "My photo" for a given program.
- SQL migrations are hand-verified, not automated-tested — Task 1 includes a manual review checklist instead of a test-runner step.
- After the new migration, keep `src/lib/types.ts`'s `loopkit` schema key in sync by hand (no linked Supabase CLI in this environment).
- `no-inline-comments` is an ESLint error in non-test files — any comment must be its own line above the code, never trailing.
- Run `pnpm check` before declaring the task done.

---

### Task 1: Migration — `vendor_join` returns the vendor's avatar URL

**Files:**

- Create: `supabase/migrations/0031_loopkit_vendor_join_avatar.sql`
- Modify: `src/lib/types.ts`

**Interfaces:**

- Produces: `loopkit.vendor_join(uuid, text)` RPC now returns an additional `vendor_avatar_url: text` column (nullable), on every row, alongside its existing columns. Task 4 consumes this.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0031_loopkit_vendor_join_avatar.sql`:

```sql
-- vendor_join: surface the vendor's profile photo (auth.users user_metadata
-- avatar_url) so /c can render it as an optional stamp mark on plain-dot
-- stamp cards (docs/superpowers/specs/2026-07-27-card-visuals-phase2-design.md,
-- section 4). Already public-facing info -- avatar_url lives in the
-- public-read vendor-images bucket (0017_loopkit_vendor_profile.sql), which
-- already anticipated /c eventually showing a vendor photo to customers.
-- Same DROP-then-CREATE-OR-REPLACE requirement as prior RETURNS TABLE
-- column additions (0016, 0018, 0027).
drop function if exists loopkit.vendor_join(uuid, text);

create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int,
  voucher_expires_at timestamptz, vendor_avatar_url text
)
language plpgsql security definer set search_path = '' as $$
declare v_program record;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  for v_program in
    select p.id from loopkit.programs p
    where p.vendor_id = p_vendor and p.active
      and not exists (
        select 1 from loopkit.cards c
        where c.program_id = p.id and c.phone = p_phone
      )
  loop
    perform loopkit.enroll_card(v_program.id, p_phone);
  end loop;

  return query
    select p.id, p.name, p.type, p.config, coalesce(c.state, '{}'::jsonb),
           coalesce(c.stamp_count, 0), c.card_token, p.reward_text,
           p.stamps_required, p.expiry_days, c.cycle_started_at, p.active,
           r.name, nc.stamp_count,
           (select min(rv.expires_at) from loopkit.reward_vouchers rv
              where rv.card_id = c.id and rv.status = 'active' and rv.expires_at is not null),
           (select u.raw_user_meta_data->>'avatar_url' from auth.users u where u.id = p_vendor)
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    left join loopkit.programs r on r.id = p.replaced_by
    left join loopkit.cards nc on nc.program_id = p.replaced_by and nc.phone = c.phone
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
```

- [ ] **Step 2: Manual review checklist (no automated SQL test in this environment)**

- [ ] `drop function if exists` precedes `create or replace` — required because Postgres can't change a `RETURNS TABLE` column list in place.
- [ ] `grant execute ... to anon, authenticated, service_role;` is present — an unauthenticated `/c` request runs as `anon`.
- [ ] The new `vendor_avatar_url` column is appended last (doesn't reorder/rename any existing column).
- [ ] No new RLS policy needed — `security definer` already bypasses RLS for this internal `auth.users` read; existing `vendor_join` grants are unchanged.
- [ ] This exposes nothing more sensitive than what's already public — the same URL is already served by the public-read `vendor-images` bucket.

- [ ] **Step 3: Hand-update `src/lib/types.ts`**

In `src/lib/types.ts`, find the `vendor_join` entry under `Functions` (around line 467) and change its `Returns` array element from:

```ts
Returns: {
  program_id: string;
  name: string;
  type: string;
  config: Json;
  state: Json;
  stamp_count: number;
  card_token: string;
  reward_text: string;
  stamps_required: number;
  expiry_days: number | null;
  cycle_started_at: string | null;
  active: boolean;
  replaced_by_name: string | null;
  replaced_by_stamp_count: number | null;
}
[];
```

to:

```ts
Returns: {
  program_id: string;
  name: string;
  type: string;
  config: Json;
  state: Json;
  stamp_count: number;
  card_token: string;
  reward_text: string;
  stamps_required: number;
  expiry_days: number | null;
  cycle_started_at: string | null;
  active: boolean;
  replaced_by_name: string | null;
  replaced_by_stamp_count: number | null;
  vendor_avatar_url: string | null;
}
[];
```

(This file was already missing the `voucher_expires_at` column added by migration `0027` — that's a pre-existing gap outside this task's scope; only add `vendor_avatar_url`, matching this task's own migration.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0031_loopkit_vendor_join_avatar.sql src/lib/types.ts
git commit -m "feat(db): vendor_join returns the vendor's avatar_url for stamp-mark photo mode"
```

---

### Task 2: Engine + config schema

**Files:**

- Modify: `src/lib/engine/types.ts`
- Modify: `src/lib/engine/stamp.ts`
- Modify: `test/lib/engine/stamp.test.ts`
- Modify: `src/lib/program.ts`
- Modify: `test/lib/program.test.ts`

**Interfaces:**

- Produces: `StampConfig.stamp_mark?: { mode: "dot" | "preset" | "photo"; preset?: "gift" | "coffee" | "star" | "heart" }`. `ProgressView`'s `dots` kind gains `markMode?` / `markPreset?` (same union types). `saveProgramSchema`'s `stamp` branch gains `stamp_mark_mode?` / `stamp_mark_preset?`. `buildProgramFields`'s stamp branch writes `config.stamp_mark`.

- [ ] **Step 1: Write the failing engine tests**

In `test/lib/engine/stamp.test.ts`, add a new `describe` block after the existing `"stampStrategy points variant"` block:

```ts
describe("stampStrategy stamp_mark passthrough", () => {
  it("carries mode/preset from config into the dots view", () => {
    const p = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      {
        stamps_required: 5,
        reward_text: "free kopi",
        stamp_mark: { mode: "preset", preset: "coffee" },
      },
      now,
    );
    expect(p.view).toEqual({
      kind: "dots",
      filled: 2,
      total: 5,
      variant: "dots",
      markMode: "preset",
      markPreset: "coffee",
    });
  });

  it("leaves markMode/markPreset undefined when stamp_mark is absent", () => {
    const p = stampStrategy.progress(
      { stamp_count: 2, reward_count: 0 },
      cfg,
      now,
    );
    expect(p.view).toEqual({
      kind: "dots",
      filled: 2,
      total: 5,
      variant: "dots",
      markMode: undefined,
      markPreset: undefined,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/lib/engine/stamp.test.ts`
Expected: FAIL — `StampConfig` has no `stamp_mark` field and the `dots` view has no `markMode`/`markPreset` keys yet (TypeScript will also fail to compile the test's `stamp_mark` config literal).

- [ ] **Step 3: Add the fields to the engine**

In `src/lib/engine/types.ts`, change the `dots` variant of `ProgressView` from:

```ts
  | {
      kind: "dots";
      filled: number;
      total: number;
      variant?: "dots" | "points";
    }
```

to:

```ts
  | {
      kind: "dots";
      filled: number;
      total: number;
      variant?: "dots" | "points";
      markMode?: "dot" | "preset" | "photo";
      markPreset?: "gift" | "coffee" | "star" | "heart";
    }
```

In `src/lib/engine/stamp.ts`, change `StampConfig` from:

```ts
export type StampConfig = {
  stamps_required: number;
  reward_text: string;
  variant?: "dots" | "flame" | "points";
  points_per_visit?: number;
};
```

to:

```ts
export type StampConfig = {
  stamps_required: number;
  reward_text: string;
  variant?: "dots" | "flame" | "points";
  points_per_visit?: number;
  stamp_mark?: {
    mode: "dot" | "preset" | "photo";
    preset?: "gift" | "coffee" | "star" | "heart";
  };
};
```

Then in the `progress()` method, change the non-flame branch's `view` from:

```ts
      view: {
        kind: "dots",
        filled,
        total,
        variant: isPoints ? "points" : "dots",
      },
```

to:

```ts
      view: {
        kind: "dots",
        filled,
        total,
        variant: isPoints ? "points" : "dots",
        markMode: config.stamp_mark?.mode,
        markPreset: config.stamp_mark?.preset,
      },
```

- [ ] **Step 4: Run to verify the engine tests pass**

Run: `pnpm exec vitest run test/lib/engine/stamp.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing schema tests**

In `test/lib/program.test.ts`, add a new `describe` block at the end of the file:

```ts
describe("saveProgramSchema stamp_mark", () => {
  it("accepts a stamp program with a preset mark", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_mark_mode: "preset",
      stamp_mark_preset: "coffee",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.stamp_mark_mode).toBe("preset");
      expect(result.data.stamp_mark_preset).toBe("coffee");
    }
  });

  it("defaults both to undefined when left blank", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_mark_mode: "",
      stamp_mark_preset: "",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.stamp_mark_mode).toBeUndefined();
      expect(result.data.stamp_mark_preset).toBeUndefined();
    }
  });

  it("rejects an unknown mode", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_mark_mode: "logo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown preset", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_mark_mode: "preset",
      stamp_mark_preset: "mascot",
    });
    expect(result.success).toBe(false);
  });
});

describe("buildProgramFields stamp_mark", () => {
  it("defaults config.stamp_mark to mode 'dot' when unset", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
    });
    const { config } = buildProgramFields(parsed);
    expect((config as { stamp_mark?: unknown }).stamp_mark).toEqual({
      mode: "dot",
      preset: undefined,
    });
  });

  it("carries the chosen mode/preset into config.stamp_mark", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
      stamp_mark_mode: "preset",
      stamp_mark_preset: "gift",
    });
    const { config } = buildProgramFields(parsed);
    expect((config as { stamp_mark?: unknown }).stamp_mark).toEqual({
      mode: "preset",
      preset: "gift",
    });
  });
});
```

Add `buildProgramFields` to the existing import from `@/lib/program` at the top of the file.

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm exec vitest run test/lib/program.test.ts`
Expected: FAIL — `saveProgramSchema`'s stamp branch has no `stamp_mark_mode`/`stamp_mark_preset` keys yet.

- [ ] **Step 7: Add the schema + builder fields**

In `src/lib/program.ts`, in the `saveProgramSchema` discriminated union's `stamp` branch, change:

```ts
      variant: z.preprocess(
        emptyToUndefined,
        z.enum(["dots", "flame", "points"]).optional(),
      ),
      points_per_visit: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().min(1).max(1000).optional(),
      ),
      expiry_days: expiryDaysSchema,
      reward_expiry_days: rewardExpiryDaysSchema,
    }),
    z.object({
      type: z.literal("lucky"),
```

to:

```ts
      variant: z.preprocess(
        emptyToUndefined,
        z.enum(["dots", "flame", "points"]).optional(),
      ),
      points_per_visit: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().min(1).max(1000).optional(),
      ),
      stamp_mark_mode: z.preprocess(
        emptyToUndefined,
        z.enum(["dot", "preset", "photo"]).optional(),
      ),
      stamp_mark_preset: z.preprocess(
        emptyToUndefined,
        z.enum(["gift", "coffee", "star", "heart"]).optional(),
      ),
      expiry_days: expiryDaysSchema,
      reward_expiry_days: rewardExpiryDaysSchema,
    }),
    z.object({
      type: z.literal("lucky"),
```

Then in `buildProgramFields`, change the stamp branch's `config` from:

```ts
      config: {
        stamps_required: data.stamps_required,
        reward_text: data.reward_text,
        variant: data.variant ?? "dots",
        points_per_visit: data.points_per_visit ?? 1,
      },
```

to:

```ts
      config: {
        stamps_required: data.stamps_required,
        reward_text: data.reward_text,
        variant: data.variant ?? "dots",
        points_per_visit: data.points_per_visit ?? 1,
        stamp_mark: {
          mode: data.stamp_mark_mode ?? "dot",
          preset: data.stamp_mark_preset,
        },
      },
```

- [ ] **Step 8: Run to verify it passes, then the full suite**

Run: `pnpm exec vitest run test/lib/program.test.ts test/lib/engine/stamp.test.ts && pnpm check`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/engine/types.ts src/lib/engine/stamp.ts src/lib/program.ts test/lib/engine/stamp.test.ts test/lib/program.test.ts
git commit -m "feat(stamp-mark): thread mode/preset config through the engine and save schema"
```

---

### Task 3: `StampDots` mark rendering + a shared resolver

**Files:**

- Modify: `src/components/stamp-dots.tsx`
- Create: `src/components/stamp-dots.dom.test.tsx`
- Create: `src/lib/stamp-mark.ts`

**Interfaces:**

- Consumes: `ProgressView`'s `dots` kind (Task 2) via `resolveStampMark`.
- Produces: `StampDots`'s new optional `mark?: StampMark` prop; exports `type StampMark`, `type StampMarkPreset` from `stamp-dots.tsx`; exports `resolveStampMark(view, vendorAvatarUrl)` from `src/lib/stamp-mark.ts`, consumed by Tasks 4 and 5.

- [ ] **Step 1: Write the failing component test**

Create `src/components/stamp-dots.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StampDots } from "@/components/stamp-dots";

describe("StampDots", () => {
  it("renders total dots, with the last one always a reward slot", () => {
    const { container } = render(<StampDots filled={2} total={5} />);
    expect(container.querySelectorAll("div > span")).toHaveLength(5);
  });

  it("falls back to plain dots (Check on filled, nothing on unfilled) with no mark prop", () => {
    const { container } = render(<StampDots filled={2} total={5} />);
    // Reward slot's Gift + 2 filled Check icons = 3 svgs; unfilled
    // non-reward slots render nothing.
    expect(container.querySelectorAll("svg")).toHaveLength(3);
  });

  it("renders the chosen preset icon on every non-reward stamp, faded/greyscale on unfilled", () => {
    const { container } = render(
      <StampDots
        filled={2}
        total={5}
        mark={{ kind: "preset", key: "coffee" }}
      />,
    );
    const spans = container.querySelectorAll("div > span");
    const nonRewardIcons = Array.from(spans)
      .slice(0, 4)
      .map((s) => s.querySelector("svg"));
    expect(nonRewardIcons.every(Boolean)).toBe(true);
    expect(nonRewardIcons[0]?.getAttribute("class")).not.toContain(
      "opacity-40",
    );
    expect(nonRewardIcons[2]?.getAttribute("class")).toContain("opacity-40");
    expect(nonRewardIcons[2]?.getAttribute("class")).toContain("grayscale");
  });

  it("renders a photo mark for filled stamps and a faded version for unfilled", () => {
    const { container } = render(
      <StampDots
        filled={2}
        total={5}
        mark={{ kind: "photo", url: "https://example.test/vendor.webp" }}
      />,
    );
    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(4);
    expect(images[0].getAttribute("class")).not.toContain("opacity-40");
    expect(images[2].getAttribute("class")).toContain("opacity-40");
    expect(images[2].getAttribute("class")).toContain("grayscale");
  });

  it("always renders the reward slot's own Gift icon regardless of mark", () => {
    const { container } = render(
      <StampDots filled={5} total={5} mark={{ kind: "preset", key: "star" }} />,
    );
    const spans = container.querySelectorAll("div > span");
    const rewardIcon = spans[spans.length - 1].querySelector("svg");
    expect(rewardIcon).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/components/stamp-dots.dom.test.tsx`
Expected: FAIL — `StampDots` has no `mark` prop yet.

- [ ] **Step 3: Rewrite the component**

Replace the full contents of `src/components/stamp-dots.tsx` with:

```tsx
import { Check, Gift, Coffee, Star, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export type StampMarkPreset = "gift" | "coffee" | "star" | "heart";
export type StampMark =
  { kind: "preset"; key: StampMarkPreset } | { kind: "photo"; url: string };

const PRESET_ICONS: Record<StampMarkPreset, typeof Gift> = {
  gift: Gift,
  coffee: Coffee,
  star: Star,
  heart: Heart,
};

export function StampDots({
  filled,
  total,
  mark,
  className,
}: {
  filled: number;
  total: number;
  mark?: StampMark;
  className?: string;
}) {
  return (
    <div className={cn("grid w-fit grid-cols-5 gap-2", className)}>
      {Array.from({ length: total }, (_, i) => {
        const isReward = i === total - 1;
        const stamped = i < filled;
        const justStamped = stamped && i === filled - 1;
        const PresetIcon =
          mark?.kind === "preset" ? PRESET_ICONS[mark.key] : null;

        return (
          <span
            key={i}
            aria-hidden="true"
            className={cn(
              "flex size-7 items-center justify-center overflow-hidden rounded-full border-2 text-sm",
              isReward
                ? "border-gold text-gold-accent"
                : stamped
                  ? "border-transparent bg-gold text-gold-foreground"
                  : "border-dashed border-muted-foreground/30",
              justStamped && "motion-safe:animate-stamp-pop",
            )}
          >
            {isReward ? (
              <Gift className="size-3.5 text-gold" />
            ) : mark?.kind === "photo" ? (
              <img
                src={mark.url}
                alt=""
                className={cn(
                  "size-full object-cover",
                  !stamped && "opacity-40 grayscale",
                )}
              />
            ) : PresetIcon ? (
              <PresetIcon
                className={cn("size-3.5", !stamped && "opacity-40 grayscale")}
              />
            ) : stamped ? (
              <Check className="size-3.5" />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/components/stamp-dots.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: Add the shared resolver**

Create `src/lib/stamp-mark.ts`:

```ts
import type { ProgressView } from "@/lib/engine/types";
import type { StampMark } from "@/components/stamp-dots";

// Shared by /c (program-card-status.tsx) and /setup's live preview
// (preview-card.tsx) so both resolve a stamp's mark identically: the
// engine's dots view carries the vendor's chosen mode/preset (config-only,
// no vendor identity), while the actual photo URL is vendor-level data
// each render call site fetches separately.
export function resolveStampMark(
  view: ProgressView,
  vendorAvatarUrl: string | null,
): StampMark | undefined {
  if (view.kind !== "dots" || view.variant === "points") return undefined;
  if (view.markMode === "photo" && vendorAvatarUrl) {
    return { kind: "photo", url: vendorAvatarUrl };
  }
  if (view.markMode === "preset" && view.markPreset) {
    return { kind: "preset", key: view.markPreset };
  }
  return undefined;
}
```

- [ ] **Step 6: Run the full suite and quality gate**

Run: `pnpm test --run && pnpm check`
Expected: All green.

- [ ] **Step 7: Commit**

```bash
git add src/components/stamp-dots.tsx src/components/stamp-dots.dom.test.tsx src/lib/stamp-mark.ts
git commit -m "feat(stamp-mark): StampDots renders a preset/photo mark, add resolveStampMark"
```

---

### Task 4: `/c` page wiring

**Files:**

- Modify: `src/features/card-check/types.ts`
- Modify: `src/features/card-check/api/actions.ts`
- Modify: `test/features/card-check/actions.test.ts`
- Modify: `src/features/card-check/components/check-form.tsx`
- Modify: `src/features/card-check/components/program-card-status.tsx`
- Modify: `src/features/card-check/components/program-card-status.dom.test.tsx`

**Interfaces:**

- Consumes: `resolveStampMark` (Task 3), `row.vendor_avatar_url` from the `vendor_join` RPC (Task 1).
- Produces: `StatusState.vendorAvatarUrl?: string | null`; `ProgramCardStatus`'s new optional prop `vendorAvatarUrl?: string | null` (default `null`, so every existing test call site keeps working unchanged).

- [ ] **Step 1: Add `vendorAvatarUrl` to `StatusState`**

In `src/features/card-check/types.ts`, change:

```ts
export type StatusState = {
  status: "idle" | "found" | "none" | "error";
  cards?: CardStatus[];
  message?: string;
  phone?: string;
};
```

to:

```ts
export type StatusState = {
  status: "idle" | "found" | "none" | "error";
  cards?: CardStatus[];
  message?: string;
  phone?: string;
  vendorAvatarUrl?: string | null;
};
```

- [ ] **Step 2: Update the existing action test fixtures**

In `test/features/card-check/actions.test.ts`, every object literal passed to `mockJoin([...])` is missing `vendor_avatar_url` — add `vendor_avatar_url: null,` to each row object in the file's existing `mockJoin` calls (8 occurrences). Then update the one test that asserts the full return shape — `"returns one card per row, reading stamp_count not the (empty) state blob"` — changing its expected object from:

```ts
expect(result).toEqual({
  status: "found",
  phone: "+6591234567",
  cards: [
    {
      programId: "p1",
      name: "Kaya Toast Co.",
      label: "3/10 stamps",
      view: { kind: "dots", filled: 3, total: 10, variant: "dots" },
      rewardReady: false,
      reward_text: "Free kopi",
      qr: '<svg data-token="tok_abc"></svg>',
      expired: false,
      active: true,
      replacedByName: null,
      carriedOverCount: null,
    },
  ],
});
```

to:

```ts
expect(result).toEqual({
  status: "found",
  phone: "+6591234567",
  vendorAvatarUrl: null,
  cards: [
    {
      programId: "p1",
      name: "Kaya Toast Co.",
      label: "3/10 stamps",
      view: {
        kind: "dots",
        filled: 3,
        total: 10,
        variant: "dots",
        markMode: undefined,
        markPreset: undefined,
      },
      rewardReady: false,
      reward_text: "Free kopi",
      qr: '<svg data-token="tok_abc"></svg>',
      expired: false,
      active: true,
      replacedByName: null,
      carriedOverCount: null,
    },
  ],
});
```

Then add one new test in the same `describe("checkStatusAction", ...)` block:

```ts
it("surfaces the vendor's avatar_url when vendor_join returns one", async () => {
  mockJoin([
    {
      program_id: "p1",
      name: "Kaya Toast Co.",
      type: "stamp",
      config: {},
      state: {},
      stamp_count: 3,
      card_token: "tok_abc",
      reward_text: "Free kopi",
      stamps_required: 10,
      expiry_days: null,
      cycle_started_at: null,
      active: true,
      vendor_avatar_url: "https://example.test/vendor.webp",
    },
  ]);

  const result = await checkStatusAction(
    STATUS_IDLE,
    form({ vendor: "v1", phone: "91234567" }),
  );

  expect(result.vendorAvatarUrl).toBe("https://example.test/vendor.webp");
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm exec vitest run test/features/card-check/actions.test.ts`
Expected: FAIL — `checkStatusAction` doesn't read or return `vendor_avatar_url` yet.

- [ ] **Step 4: Wire it through `actions.ts`**

In `src/features/card-check/api/actions.ts`, add `vendor_avatar_url: string | null;` to the `VendorJoinRow` type:

```ts
type VendorJoinRow = {
  program_id: string;
  name: string;
  type: string;
  config: unknown;
  state: unknown;
  stamp_count: number;
  card_token: string;
  reward_text: string;
  stamps_required: number;
  expiry_days: number | null;
  cycle_started_at: string | null;
  active: boolean;
  replaced_by_name: string | null;
  replaced_by_stamp_count: number | null;
  vendor_avatar_url: string | null;
};
```

Then in `checkStatusAction`, change the `return { status: "found", cards, phone: normalized.phone };` line to:

```ts
return {
  status: "found",
  cards,
  phone: normalized.phone,
  vendorAvatarUrl: rows[0]?.vendor_avatar_url ?? null,
};
```

(Every row carries the same vendor-level `vendor_avatar_url`, so reading it off `rows[0]` is exactly as correct as reading it off any other row.)

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm exec vitest run test/features/card-check/actions.test.ts`
Expected: PASS

- [ ] **Step 6: Thread it through `check-form.tsx` and `program-card-status.tsx`**

In `src/features/card-check/components/check-form.tsx`, change:

```tsx
{
  state.status === "found" && state.cards && (
    <div className="space-y-4">
      {state.cards.map((card) => (
        <ProgramCardStatus
          key={card.programId}
          card={card}
          phone={state.phone!}
        />
      ))}
    </div>
  );
}
```

to:

```tsx
{
  state.status === "found" && state.cards && (
    <div className="space-y-4">
      {state.cards.map((card) => (
        <ProgramCardStatus
          key={card.programId}
          card={card}
          phone={state.phone!}
          vendorAvatarUrl={state.vendorAvatarUrl ?? null}
        />
      ))}
    </div>
  );
}
```

In `src/features/card-check/components/program-card-status.tsx`, add the import:

```ts
import { resolveStampMark } from "@/lib/stamp-mark";
```

Change the function signature from:

```tsx
export function ProgramCardStatus({
  card,
  phone,
}: {
  card: CardStatus;
  phone: string;
}) {
```

to:

```tsx
export function ProgramCardStatus({
  card,
  phone,
  vendorAvatarUrl = null,
}: {
  card: CardStatus;
  phone: string;
  vendorAvatarUrl?: string | null;
}) {
```

And change the `dots`-kind branch from:

```tsx
      ) : view?.kind === "dots" ? (
        view.variant === "points" ? (
          <PointsBar filled={view.filled} total={view.total} />
        ) : (
          <StampDots filled={view.filled} total={view.total} />
        )
      ) : null}
```

to:

```tsx
      ) : view?.kind === "dots" ? (
        view.variant === "points" ? (
          <PointsBar filled={view.filled} total={view.total} />
        ) : (
          <StampDots
            filled={view.filled}
            total={view.total}
            mark={resolveStampMark(view, vendorAvatarUrl)}
          />
        )
      ) : null}
```

- [ ] **Step 7: Add a rendering test**

In `src/features/card-check/components/program-card-status.dom.test.tsx`, add:

```tsx
it("renders a photo stamp mark when the card's view carries markMode photo and a vendor avatar is provided", () => {
  const card: CardStatus = {
    programId: "p1",
    name: "Kaya Toast Co.",
    label: "2/5 stamps",
    view: {
      kind: "dots",
      filled: 2,
      total: 5,
      variant: "dots",
      markMode: "photo",
    },
    rewardReady: false,
    reward_text: "Free kopi",
    qr: "",
    expired: false,
    active: true,
    replacedByName: null,
    carriedOverCount: null,
  };
  const { container } = render(
    <ProgramCardStatus
      card={card}
      phone="+6591234567"
      vendorAvatarUrl="https://example.test/vendor.webp"
    />,
  );
  expect(container.querySelectorAll("img")).toHaveLength(4);
});
```

(Match this file's existing import style for `CardStatus`, `render`, and `ProgramCardStatus` — read the top of the file first to place the new `it` inside its existing top-level `describe` block and reuse whatever base `card` fixture it already has, adapting only the `view` field.)

- [ ] **Step 8: Run the full suite and quality gate**

Run: `pnpm test --run && pnpm check`
Expected: All green.

- [ ] **Step 9: Commit**

```bash
git add src/features/card-check src/app/c test/features/card-check/actions.test.ts
git commit -m "feat(stamp-mark): /c resolves and renders the vendor's stamp mark"
```

---

### Task 5: `/setup` wiring (form UI + live preview)

**Files:**

- Modify: `src/app/setup/page.tsx`
- Modify: `src/app/setup/setup-form.tsx`
- Modify: `src/app/setup/setup-form.dom.test.tsx`
- Modify: `src/app/setup/preview-state.ts`
- Modify: `src/app/setup/preview-animation.ts`
- Modify: `src/app/setup/preview-card.tsx`
- Modify: `src/app/setup/preview-card.dom.test.tsx`

**Interfaces:**

- Consumes: `resolveStampMark` (Task 3); `StampMarkPreset` type (Task 3).
- Produces: `PreviewInput` gains `stampMarkMode`/`stampMarkPreset`; `PreviewCard`'s new optional prop `vendorAvatarUrl?: string | null` (default `null`).

- [ ] **Step 1: Fetch the vendor's avatar in `page.tsx`**

In `src/app/setup/page.tsx`, `user` (from `requireVendor()`) already carries `user_metadata` — no new fetch needed. Add, right after `const { user } = await requireVendor();`:

```ts
const vendorAvatarUrl =
  (user.user_metadata?.avatar_url as string | undefined) ?? null;
```

Then pass it to both `<SetupForm ... />` call sites in this file (one for the normal create/edit view, one for the `prep` view — both currently end with a closing `/>` a few lines below their own props), adding `vendorAvatarUrl={vendorAvatarUrl}` alongside their existing props.

- [ ] **Step 2: Add `PreviewInput` fields and thread them through `buildPreviewProgram`**

In `src/app/setup/preview-state.ts`, add to the `PreviewInput` type:

```ts
export type PreviewInput = {
  type: ProgramType;
  name: string;
  rewardText: string;
  stampsRequired: number;
  visitsToBloom: number;
  winPercent: number;
  pityCeiling: number | undefined;
  segments: {
    label: string;
    weight: number;
    is_reward: boolean;
    color?: string;
  }[];
  headStart: boolean;
  headStartPercent: number;
  variant: "dots" | "flame" | "points" | "plant" | "cup";
  pointsPerVisit?: number;
  stampMarkMode: "dot" | "preset" | "photo";
  stampMarkPreset: "gift" | "coffee" | "star" | "heart";
};
```

Then in `buildPreviewProgram`'s `stamp` branch, change:

```ts
if (input.type === "stamp") {
  return {
    type: "stamp",
    stamps_required: input.stampsRequired,
    reward_text: input.rewardText,
    config: {
      stamps_required: input.stampsRequired,
      reward_text: input.rewardText,
      variant: input.variant,
      points_per_visit:
        input.variant === "points" ? input.pointsPerVisit : undefined,
    },
  };
}
```

to:

```ts
if (input.type === "stamp") {
  return {
    type: "stamp",
    stamps_required: input.stampsRequired,
    reward_text: input.rewardText,
    config: {
      stamps_required: input.stampsRequired,
      reward_text: input.rewardText,
      variant: input.variant,
      points_per_visit:
        input.variant === "points" ? input.pointsPerVisit : undefined,
      stamp_mark: {
        mode: input.stampMarkMode,
        preset: input.stampMarkPreset,
      },
    },
  };
}
```

- [ ] **Step 3: Thread the fields through `usePreviewAnimation`**

In `src/app/setup/preview-animation.ts`, add `stampMarkMode` and `stampMarkPreset` to the destructure:

```ts
const {
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  segments,
  headStart,
  headStartPercent,
  variant,
  pointsPerVisit,
  stampMarkMode,
  stampMarkPreset,
} = input;
```

and to the `recipeKey` array (right after `pointsPerVisit`):

```ts
const recipeKey = JSON.stringify([
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  segments,
  headStart,
  headStartPercent,
  variant,
  pointsPerVisit,
  stampMarkMode,
  stampMarkPreset,
]);
```

(`input` itself is already passed wholesale to `buildPreviewProgram`/`buildInitialCard`/`buildPreviewProgress`, so no further changes are needed in this file — the new fields flow through automatically once `PreviewInput` includes them.)

- [ ] **Step 4: Add the mark picker UI + state to `setup-form.tsx`**

Add to the imports at the top of `src/app/setup/setup-form.tsx`:

```ts
import {
  Tag,
  SlidersHorizontal,
  Image as ImageIcon,
  Gift,
  Coffee,
  Star,
  Heart,
} from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { StampMarkPreset } from "@/components/stamp-dots";
```

(replacing the existing `import { Tag, SlidersHorizontal } from "lucide-react";` line).

Add `vendorAvatarUrl` to `SetupForm`'s props:

```tsx
export function SetupForm({
  program,
  isEdit,
  replacingId,
  replacingType,
  prepping = false,
  vendorAvatarUrl = null,
}: {
  program: Program | null;
  isEdit: boolean;
  replacingId: string | null;
  replacingType: string | null;
  prepping?: boolean;
  vendorAvatarUrl?: string | null;
}) {
```

Add `stamp_mark?: { mode?: string; preset?: string }` to the `config` cast:

```ts
const config = (program?.config ?? {}) as {
  win_probability?: number;
  pity_ceiling?: number;
  reward_text?: string;
  stages?: { threshold: number }[];
  segments?: {
    label: string;
    weight: number;
    reward_text?: string;
    color?: string;
  }[];
  variant?: string;
  stamp_mark?: { mode?: string; preset?: string };
};
```

Add new state, right after the existing `pointsPerVisit` state:

```tsx
const [stampMarkMode, setStampMarkMode] = useState<"dot" | "preset" | "photo">(
  (config.stamp_mark?.mode as "dot" | "preset" | "photo" | undefined) ?? "dot",
);
const [stampMarkPreset, setStampMarkPreset] = useState<StampMarkPreset>(
  (config.stamp_mark?.preset as StampMarkPreset | undefined) ?? "gift",
);
```

Add `stampMarkMode` and `stampMarkPreset` to the `usePreviewAnimation` call:

```tsx
const {
  progress: previewProgress,
  celebrating,
  revealing,
  lastChanceResult,
} = usePreviewAnimation({
  type,
  name,
  rewardText,
  stampsRequired,
  visitsToBloom,
  winPercent,
  pityCeiling,
  segments,
  headStart,
  headStartPercent,
  variant,
  pointsPerVisit,
  stampMarkMode,
  stampMarkPreset,
});
```

Add `vendorAvatarUrl` to the `PreviewCard` element:

```tsx
const preview = (
  <PreviewCard
    progress={previewProgress}
    name={name}
    rewardText={rewardText}
    celebrating={celebrating}
    revealing={revealing}
    lastChanceResult={lastChanceResult}
    vendorAvatarUrl={vendorAvatarUrl}
  />
);
```

Add a new `Section` (only rendered for plain-dot stamp cards) right after the closing `</Section>` of the "Basics" section and before the "Rules" `<Section>`:

```tsx
{
  type === "stamp" && variant === "dots" && (
    <Section
      icon={<ImageIcon className="size-4" />}
      eyebrow="Optional"
      title="Stamp mark"
      description="What appears on each stamp instead of a plain dot."
    >
      <ToggleGroup
        type="single"
        variant="outline"
        value={stampMarkMode}
        onValueChange={(v) =>
          v && setStampMarkMode(v as "dot" | "preset" | "photo")
        }
        className="justify-start"
      >
        <ToggleGroupItem value="dot">Plain dot</ToggleGroupItem>
        <ToggleGroupItem value="preset">Preset icon</ToggleGroupItem>
        <ToggleGroupItem value="photo" disabled={!vendorAvatarUrl}>
          My photo
        </ToggleGroupItem>
      </ToggleGroup>
      {stampMarkMode === "photo" && !vendorAvatarUrl && (
        <p className="text-xs text-muted-foreground">
          Add a profile photo first, from your{" "}
          <Link href="/dashboard/profile" className="underline">
            profile page
          </Link>
          .
        </p>
      )}
      {stampMarkMode === "preset" && (
        <div className="flex gap-2">
          {(
            [
              ["gift", Gift],
              ["coffee", Coffee],
              ["star", Star],
              ["heart", Heart],
            ] as const
          ).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStampMarkPreset(key)}
              aria-label={key}
              className={cn(
                "flex size-11 items-center justify-center rounded-xl border transition-colors",
                stampMarkPreset === key
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-card text-muted-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      )}
      <input type="hidden" name="stamp_mark_mode" value={stampMarkMode} />
      {stampMarkMode === "preset" && (
        <input type="hidden" name="stamp_mark_preset" value={stampMarkPreset} />
      )}
    </Section>
  );
}
```

This requires a `Link` import from `next/link` — add `import Link from "next/link";` at the top of the file if it isn't already imported (check first; this file doesn't currently import it).

- [ ] **Step 5: Update `preview-card.tsx` to resolve and render the mark**

In `src/app/setup/preview-card.tsx`, add the import:

```ts
import { resolveStampMark } from "@/lib/stamp-mark";
```

Add `vendorAvatarUrl` to the props:

```tsx
export function PreviewCard({
  progress,
  name,
  rewardText,
  celebrating = false,
  revealing = false,
  lastChanceResult = null,
  vendorAvatarUrl = null,
}: {
  progress: Progress;
  name: string;
  rewardText: string;
  celebrating?: boolean;
  revealing?: boolean;
  lastChanceResult?: { won: boolean } | null;
  vendorAvatarUrl?: string | null;
}) {
```

Change the `dots`-kind branch from:

```tsx
        ) : view.kind === "dots" ? (
          view.variant === "points" ? (
            <PointsBar filled={view.filled} total={view.total} />
          ) : (
            <StampDots filled={view.filled} total={view.total} />
          )
        ) : null}
```

to:

```tsx
        ) : view.kind === "dots" ? (
          view.variant === "points" ? (
            <PointsBar filled={view.filled} total={view.total} />
          ) : (
            <StampDots
              filled={view.filled}
              total={view.total}
              mark={resolveStampMark(view, vendorAvatarUrl)}
            />
          )
        ) : null}
```

- [ ] **Step 6: Add a rendering test**

In `src/app/setup/preview-card.dom.test.tsx`, add a new test near the existing dots-view tests:

```tsx
it("renders a preset stamp mark when the view carries markMode preset", () => {
  const { container } = render(
    <PreviewCard
      progress={{
        stage: "collecting",
        label: "2/5 stamps",
        rewardReady: false,
        view: {
          kind: "dots",
          filled: 2,
          total: 5,
          variant: "dots",
          markMode: "preset",
          markPreset: "star",
        },
      }}
      name="Coffee card"
      rewardText="Free kopi"
    />,
  );
  const spans = container.querySelectorAll("div > span");
  expect(spans[0].querySelector("svg")).toBeInTheDocument();
});
```

(Match this file's existing import style — read its top for how `Progress` values are already constructed in neighboring tests, and place this alongside them.)

- [ ] **Step 7: Confirm `setup-form.dom.test.tsx` needs no change**

This file's only `FormData`-shape assertion is `expect(JSON.parse(submitted.get("segments") as string)).toHaveLength(2)` (a single named field, not an exact-key-set check), so the new always-present `stamp_mark_mode` hidden input doesn't break anything here. No edit needed — this step is just confirmation, run as part of Step 8's full suite.

- [ ] **Step 8: Run the full suite and quality gate**

Run: `pnpm test --run && pnpm check`
Expected: All green.

- [ ] **Step 9: Commit**

```bash
git add src/app/setup
git commit -m "feat(stamp-mark): /setup picks a stamp mark and previews it live"
```
