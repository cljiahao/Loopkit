# Points Club Reward Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Points Club from a relabeled Stamp Card into a real accumulate-then-spend shop, with two vendor-picked redemption modes (catalog, offset) fixed per program at setup.

**Architecture:** One new migration (`0043`) adds a per-voucher scan token to the existing `reward_vouchers` ledger plus 4 new RPCs; `stamp.ts`'s engine gains points-only config/view fields; setup, customer (`/c`), and vendor-scan surfaces each get the new UI their side of the flow needs. No vendors are onboarded on any kit yet, so every change here is a straight replacement — no legacy-path branching for an existing live points program.

**Tech Stack:** Next.js 16 Server Actions, Supabase Postgres (SECURITY DEFINER RPCs, RLS), Zod, Vitest + Testing Library, `@zxing/browser` (QR scan, already in use).

**Spec:** `docs/superpowers/specs/2026-09-04-points-club-reward-shop-design.md`

## Global Constraints

- **QR only** — no new barcode format.
- **No vendors onboarded on any kit yet** — breaking changes are fine, no migration/backfill path needed for existing data.
- **`stamps_required` stays `not null`** on `programs` — for the 2 new modes it's a server-computed fallback (max catalog cost / offset rate's `points`), never user-edited.
- **Vouchers snapshot their reward text at selection time** — never reference a live catalog item by id after creation.
- **Every new server-side amount (cost, rate) is re-derived from the program's own `config` inside the RPC** — never trust a client-supplied cost/rate.
- `pnpm check` + full `pnpm test --run` + `pnpm build` must stay green after every task, per project convention (`AGENTS.md`).
- Every touched folder's `README.md` is updated in the same task, per project convention — not deferred.

---

## Task 1: Migration `0043_loopkit_points_reward_shop.sql`

**Files:**

- Create: `supabase/migrations/0043_loopkit_points_reward_shop.sql`

**Interfaces:**

- Produces: `voucher_token` column on `reward_vouchers`; RPCs `voucher_by_token(p_token text)`, `redeem_voucher_by_token(p_token text)`, `select_points_reward(p_program uuid, p_phone text, p_item_id text)`, `apply_points_offset(p_card uuid, p_points int)`; `vendor_join` gains `active_vouchers jsonb` alongside its existing `voucher_expires_at`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0043_loopkit_points_reward_shop.sql
-- Points Club reward shop: two vendor-picked redemption modes replacing
-- the single-fixed-reward behavior for new points programs. See
-- docs/superpowers/specs/2026-09-04-points-club-reward-shop-design.md.

alter table loopkit.reward_vouchers
  add column voucher_token text unique
    default replace(gen_random_uuid()::text, '-', '');

create index reward_vouchers_token_idx on loopkit.reward_vouchers(voucher_token);

alter table loopkit.stamp_events
  drop constraint if exists stamp_events_kind_check;
alter table loopkit.stamp_events
  add constraint stamp_events_kind_check
    check (kind in ('stamp','redeem','visit','win','adjust',
                     'points_reward_selected','points_offset_applied'));

-- Vendor scan resolve for a voucher token (mirrors card_by_token). Only a
-- vendor who owns the voucher's program can resolve it.
create or replace function loopkit.voucher_by_token(p_token text)
returns table (
  program_id uuid, card_id uuid, voucher_id uuid, phone text,
  reward_text text, status text
)
language sql security definer stable set search_path = '' as $$
  select rv.program_id, rv.card_id, rv.id, c.phone, rv.reward_text, rv.status
  from loopkit.reward_vouchers rv
  join loopkit.cards c on c.id = rv.card_id
  where rv.voucher_token = p_token and loopkit.owns_program(rv.program_id);
$$;

-- Marks one voucher redeemed by its own token — the vendor scan/confirm
-- path for a catalog-mode reward, distinct from redeem_oldest_voucher
-- (which Stamp/Plant's single-fixed-reward redeem still uses).
create or replace function loopkit.redeem_voucher_by_token(p_token text)
returns loopkit.reward_vouchers
language plpgsql security definer set search_path = '' as $$
declare
  v_voucher loopkit.reward_vouchers;
begin
  select * into v_voucher from loopkit.reward_vouchers
    where voucher_token = p_token;
  if v_voucher.id is null or not loopkit.owns_program(v_voucher.program_id) then
    raise exception 'not authorized';
  end if;
  if v_voucher.status = 'redeemed' then
    raise exception 'already_redeemed';
  end if;
  if v_voucher.status = 'expired'
     or (v_voucher.expires_at is not null and v_voucher.expires_at < now()) then
    raise exception 'expired';
  end if;
  update loopkit.reward_vouchers
    set status = 'redeemed', redeemed_at = now(), updated_at = now()
    where id = v_voucher.id
    returning * into v_voucher;
  return v_voucher;
end;
$$;

-- Customer self-service pick: anon-grantable, same phone+program trust
-- model regenerate_card already uses (no customer auth exists in this
-- app). Re-derives cost/label from the program's own config server-side —
-- never trusts a client-supplied cost.
create or replace function loopkit.select_points_reward(
  p_program uuid, p_phone text, p_item_id text
)
returns loopkit.reward_vouchers
language plpgsql security definer set search_path = '' as $$
declare
  v_config       jsonb;
  v_card_id      uuid;
  v_stamp_count  int;
  v_item         jsonb;
  v_cost         int;
  v_label        text;
  v_expiry_days  int;
  v_voucher      loopkit.reward_vouchers;
begin
  if p_phone !~ '^\+65[3689][0-9]{7}$' then
    raise exception 'invalid phone';
  end if;

  select config, reward_expiry_days into v_config, v_expiry_days
    from loopkit.programs
    where id = p_program and active
      and type = 'stamp'
      and config->>'variant' = 'points'
      and config->>'redemption_mode' = 'catalog';
  if v_config is null then
    raise exception 'program not found';
  end if;

  select item into v_item
    from jsonb_array_elements(v_config->'catalog') item
    where item->>'id' = p_item_id;
  if v_item is null then
    raise exception 'reward not found';
  end if;
  v_cost := (v_item->>'cost')::int;
  v_label := v_item->>'label';

  select id, stamp_count into v_card_id, v_stamp_count
    from loopkit.cards
    where program_id = p_program and phone = p_phone;
  if v_card_id is null then
    raise exception 'card not found';
  end if;
  if v_stamp_count < v_cost then
    raise exception 'insufficient_points';
  end if;

  update loopkit.cards
    set stamp_count = stamp_count - v_cost, updated_at = now()
    where id = v_card_id;

  insert into loopkit.reward_vouchers
    (card_id, program_id, reward_text, expires_at, status)
    values (
      v_card_id, p_program, v_label,
      case when v_expiry_days is null then null
        else now() + (v_expiry_days || ' days')::interval end,
      'active'
    )
    returning * into v_voucher;

  insert into loopkit.stamp_events (card_id, kind)
    values (v_card_id, 'points_reward_selected');

  return v_voucher;
end;
$$;

-- Vendor-initiated at the register: deducts p_points from a card's
-- balance and returns the dollar figure to apply manually. Owner-gated —
-- distinct from select_points_reward's anon/phone-trust model, since this
-- is a vendor dashboard action against a card the vendor already scanned.
create or replace function loopkit.apply_points_offset(
  p_card uuid, p_points int
)
returns table (id uuid, phone text, stamp_count int, dollars numeric)
language plpgsql security definer set search_path = '' as $$
declare
  v_card         loopkit.cards;
  v_config       jsonb;
  v_rate_points  numeric;
  v_rate_dollars numeric;
begin
  select * into v_card from loopkit.cards where id = p_card;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;
  if p_points <= 0 or p_points > v_card.stamp_count then
    raise exception 'invalid amount';
  end if;

  select config into v_config from loopkit.programs where id = v_card.program_id;
  if v_config->>'redemption_mode' is distinct from 'offset' then
    raise exception 'not_offset_mode';
  end if;
  v_rate_points := (v_config->'offset_rate'->>'points')::numeric;
  v_rate_dollars := (v_config->'offset_rate'->>'dollars')::numeric;

  update loopkit.cards
    set stamp_count = stamp_count - p_points, updated_at = now()
    where id = p_card
    returning * into v_card;

  insert into loopkit.stamp_events (card_id, kind)
    values (p_card, 'points_offset_applied');

  return query select v_card.id, v_card.phone, v_card.stamp_count,
    round(p_points * v_rate_dollars / v_rate_points, 2);
end;
$$;

grant execute on function loopkit.voucher_by_token(text) to authenticated;
grant execute on function loopkit.redeem_voucher_by_token(text) to authenticated;
grant execute on function loopkit.select_points_reward(uuid, text, text) to anon, authenticated;
grant execute on function loopkit.apply_points_offset(uuid, int) to authenticated;

-- vendor_join gains active_vouchers (jsonb array) alongside the existing
-- scalar voucher_expires_at — catalog mode can have several simultaneously
-- pending vouchers, not just the one Stamp/Plant's single-fixed-reward
-- model needs. Same DROP-then-CREATE-OR-REPLACE requirement as prior
-- RETURNS TABLE column additions (0016, 0018, 0027).
drop function if exists loopkit.vendor_join(uuid, text);

create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean,
  replaced_by_name text, replaced_by_stamp_count int,
  voucher_expires_at timestamptz, active_vouchers jsonb
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
           (select coalesce(jsonb_agg(jsonb_build_object(
                'id', rv.id, 'voucher_token', rv.voucher_token,
                'reward_text', rv.reward_text, 'expires_at', rv.expires_at
              ) order by rv.earned_at asc), '[]'::jsonb)
            from loopkit.reward_vouchers rv
            where rv.card_id = c.id and rv.status = 'active'
              and (rv.expires_at is null or rv.expires_at >= now()))
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

- [ ] **Step 2: Apply locally and hand-verify**

Run: `supabase migration up` (or `supabase db reset` for a clean rebuild).
Expected: migration applies with no error; `select voucher_token from loopkit.reward_vouchers limit 1;` and the 4 new function signatures all resolve in `psql`/Supabase Studio.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0043_loopkit_points_reward_shop.sql
git commit -m "feat(points): reward-shop migration — voucher tokens + 4 new RPCs"
```

---

## Task 2: Regenerate `src/lib/types.ts`

**Files:**

- Modify: `src/lib/types.ts` (fully regenerated, not hand-edited)

**Interfaces:**

- Consumes: Task 1's applied migration (must be run against the same local DB `gen types` reads from).
- Produces: `Database["loopkit"]["Tables"]["reward_vouchers"]["Row"]` gains `voucher_token`; new `Database["loopkit"]["Functions"]` entries for the 4 new RPCs; `vendor_join`'s return row gains `active_vouchers`.

- [ ] **Step 1: Regenerate**

Run: `supabase gen types typescript --local > src/lib/types.ts`

- [ ] **Step 2: Verify the new pieces are present**

Run: `grep -n "voucher_token\|select_points_reward\|apply_points_offset\|voucher_by_token\|redeem_voucher_by_token\|active_vouchers" src/lib/types.ts`
Expected: all 6 terms found.

- [ ] **Step 3: Type-check the whole project**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors (the file is additive-only; nothing yet references the new fields).

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "chore(types): regenerate after 0043_loopkit_points_reward_shop"
```

---

## Task 3: Engine — `stamp.ts` + `types.ts`

**Files:**

- Modify: `src/lib/engine/stamp.ts`
- Modify: `src/lib/engine/types.ts`
- Test: `test/lib/engine/stamp.test.ts`

**Interfaces:**

- Produces: `PointsRedemptionMode`, `PointsCatalogItem`, `PointsOffsetRate` types from `stamp.ts`; `StampConfig.redemption_mode?/catalog?/offset_rate?`; `ProgressView`'s `"dots"` kind gains `redemptionMode?/catalog?/offsetRate?/offsetValue?`.

- [ ] **Step 1: Write the failing tests**

Append to `test/lib/engine/stamp.test.ts`:

```ts
describe("stampStrategy points catalog mode", () => {
  const catalogCfg = {
    stamps_required: 300,
    reward_text: "unused",
    variant: "points" as const,
    redemption_mode: "catalog" as const,
    catalog: [
      { id: "a", label: "Free drink", cost: 100 },
      { id: "b", label: "Free meal", cost: 300 },
    ],
  };

  it("rewardReady is true once the balance covers the cheapest item", () => {
    const notReady = stampStrategy.progress(
      { stamp_count: 50, reward_count: 0 },
      catalogCfg,
      now,
    );
    expect(notReady.rewardReady).toBe(false);
    const ready = stampStrategy.progress(
      { stamp_count: 100, reward_count: 0 },
      catalogCfg,
      now,
    );
    expect(ready.rewardReady).toBe(true);
  });

  it("marks each catalog item's affordable flag against the current balance", () => {
    const p = stampStrategy.progress(
      { stamp_count: 150, reward_count: 0 },
      catalogCfg,
      now,
    );
    expect(p.view).toMatchObject({
      redemptionMode: "catalog",
      catalog: [
        { id: "a", label: "Free drink", cost: 100, affordable: true },
        { id: "b", label: "Free meal", cost: 300, affordable: false },
      ],
    });
  });

  it("labels the view with the raw balance, not a filled/total fraction", () => {
    const p = stampStrategy.progress(
      { stamp_count: 150, reward_count: 0 },
      catalogCfg,
      now,
    );
    expect(p.label).toBe("150 points");
  });
});

describe("stampStrategy points offset mode", () => {
  const offsetCfg = {
    stamps_required: 100,
    reward_text: "unused",
    variant: "points" as const,
    redemption_mode: "offset" as const,
    offset_rate: { points: 100, dollars: 1 },
  };

  it("rewardReady is true once the balance is above zero", () => {
    const empty = stampStrategy.progress(
      { stamp_count: 0, reward_count: 0 },
      offsetCfg,
      now,
    );
    expect(empty.rewardReady).toBe(false);
    const some = stampStrategy.progress(
      { stamp_count: 1, reward_count: 0 },
      offsetCfg,
      now,
    );
    expect(some.rewardReady).toBe(true);
  });

  it("computes offsetValue from the balance and the configured rate", () => {
    const p = stampStrategy.progress(
      { stamp_count: 250, reward_count: 0 },
      offsetCfg,
      now,
    );
    expect(p.view).toMatchObject({
      redemptionMode: "offset",
      offsetRate: { points: 100, dollars: 1 },
      offsetValue: 2.5,
    });
  });

  it("never carries a catalog for offset mode", () => {
    const p = stampStrategy.progress(
      { stamp_count: 250, reward_count: 0 },
      offsetCfg,
      now,
    );
    expect(p.view).toMatchObject({ catalog: undefined });
  });
});

describe("stampStrategy points, no redemption_mode set (leaves new fields undefined)", () => {
  it("leaves redemptionMode/catalog/offsetRate/offsetValue undefined", () => {
    const p = stampStrategy.progress(
      { stamp_count: 40, reward_count: 0 },
      {
        stamps_required: 100,
        reward_text: "free kopi",
        variant: "points" as const,
      },
      now,
    );
    expect(p.view).toMatchObject({
      redemptionMode: undefined,
      catalog: undefined,
      offsetRate: undefined,
      offsetValue: undefined,
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/lib/engine/stamp.test.ts`
Expected: FAIL — `redemption_mode`/`catalog`/`offset_rate` don't exist on `StampConfig` yet (TS error at test-collection time), and `rewardReady`/`view` don't carry the new fields.

- [ ] **Step 3: Implement**

In `src/lib/engine/stamp.ts`, add near the top (after `PRESET_ICONS`... no — this file has no presets; add right after the existing type exports):

```ts
export type PointsRedemptionMode = "catalog" | "offset";
export type PointsCatalogItem = { id: string; label: string; cost: number };
export type PointsOffsetRate = { points: number; dollars: number };
```

Extend `StampConfig`:

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
  stamp_style?: StampVisualStyle;
  stamp_color?: string;
  // Points-only. No redemption_mode means the plain single-threshold
  // behavior below still applies — every new Points Club program picks
  // one, but nothing else in this config shape changes for it.
  redemption_mode?: PointsRedemptionMode;
  catalog?: PointsCatalogItem[];
  offset_rate?: PointsOffsetRate;
};
```

Add 2 small helpers right below `flameStageFor` (before `export const stampStrategy`):

```ts
function pointsRewardReady(config: StampConfig, balance: number): boolean {
  if (config.redemption_mode === "offset") return balance > 0;
  const cheapest = (config.catalog ?? []).reduce(
    (min, item) => Math.min(min, item.cost),
    Infinity,
  );
  return balance >= cheapest;
}

function pointsOffsetValue(
  config: StampConfig,
  balance: number,
): number | undefined {
  if (config.redemption_mode !== "offset" || !config.offset_rate) {
    return undefined;
  }
  const { points, dollars } = config.offset_rate;
  return Math.round(((balance * dollars) / points) * 100) / 100;
}
```

In `progress()`, right after the existing `const isPoints = config.variant === "points";` line and before the existing `const unitLabel = ...` line, insert a new early return:

```ts
const isPoints = config.variant === "points";
if (isPoints && config.redemption_mode) {
  const balance = state.stamp_count;
  const shopReady = pointsRewardReady(config, balance);
  return {
    stage: shopReady ? "ready" : "collecting",
    label: `${balance.toLocaleString()} points`,
    view: {
      kind: "dots",
      filled,
      total,
      variant: "points",
      redemptionMode: config.redemption_mode,
      catalog: config.catalog?.map((item) => ({
        ...item,
        affordable: balance >= item.cost,
      })),
      offsetRate: config.offset_rate,
      offsetValue: pointsOffsetValue(config, balance),
    },
    rewardReady: shopReady,
  };
}
const unitLabel = isPoints ? "points" : "stamps";
```

In `src/lib/engine/types.ts`, extend the `"dots"` kind:

```ts
  | {
      kind: "dots";
      filled: number;
      total: number;
      variant?: "dots" | "points";
      markMode?: "dot" | "preset" | "photo";
      markPreset?: "gift" | "coffee" | "star" | "heart";
      style?: "dots" | "seal" | "ink" | "punch" | "charm";
      color?: string;
      redemptionMode?: "catalog" | "offset";
      catalog?: {
        id: string;
        label: string;
        cost: number;
        affordable: boolean;
      }[];
      offsetRate?: { points: number; dollars: number };
      offsetValue?: number;
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/lib/engine/stamp.test.ts`
Expected: PASS — all tests including the pre-existing ones in this file (the new branch is gated on `redemption_mode` being set, so every existing classic-points/dots/flame test takes the unchanged path below it).

- [ ] **Step 5: Full check**

Run: `pnpm check`
Expected: PASS (watch for `sonarjs/cognitive-complexity` on `progress()` — the 2 helpers above exist specifically to keep it out of that function; if it still trips, extract the new `if` block's body into its own top-level function `pointsShopProgress(state, config, filled, total)` returning the object literal, and call it from `progress()`).

- [ ] **Step 6: Update `src/lib/engine/README.md`**

Extend the `stamp.ts` bullet with a sentence: `stamp.ts` also exports `PointsRedemptionMode`/`PointsCatalogItem`/`PointsOffsetRate` and threads them into the dots view's `redemptionMode`/`catalog`/`offsetRate`/`offsetValue` — points-only, undefined unless `redemption_mode` is set. Extend the `types.ts` bullet's "dots" description the same way.

- [ ] **Step 7: Commit**

```bash
git add src/lib/engine/stamp.ts src/lib/engine/types.ts src/lib/engine/README.md test/lib/engine/stamp.test.ts
git commit -m "feat(points): engine support for catalog/offset redemption modes"
```

---

## Task 4: `program-config.ts` — catalog item schema

**Files:**

- Modify: `src/lib/program-config.ts`

**Interfaces:**

- Produces: `pointsCatalogItemInputSchema` (Zod), `PointsCatalogItemInput` type, re-exported `PointsRedemptionMode`/`PointsOffsetRate` types.
- Consumes: `PointsRedemptionMode`, `PointsCatalogItem`, `PointsOffsetRate` from Task 3's `stamp.ts`.

- [ ] **Step 1: Implement**

In `src/lib/program-config.ts`, extend the top imports and re-export line:

```ts
import type { ChanceConfig, ScratchCoverStyle } from "@/lib/engine/chance";
import type {
  StampVisualStyle,
  PointsRedemptionMode,
  PointsOffsetRate,
} from "@/lib/engine/stamp";

export type {
  ScratchCoverStyle,
  StampVisualStyle,
  PointsRedemptionMode,
  PointsOffsetRate,
};
```

Add, right after `segmentInputSchema`/`SegmentInput`:

```ts
// Form-side shape for one Points Club catalog item — no `id` here, same
// as SegmentInput: buildProgramFields assigns a fresh id server-side
// (crypto.randomUUID()), mirroring buildChanceConfig's segment ids.
export const pointsCatalogItemInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  cost: z.coerce.number().int().min(1).max(100000),
});
export type PointsCatalogItemInput = z.infer<
  typeof pointsCatalogItemInputSchema
>;
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors — this file has no runtime behavior change yet, just new exports nothing else imports.

- [ ] **Step 3: Update `src/lib/README.md`**

Extend the `program-config.ts` bullet: also exports `pointsCatalogItemInputSchema`/`PointsCatalogItemInput` (Points Club's catalog-item shape, no `id` — assigned server-side like Wheel/Scratch segments) and re-exports `PointsRedemptionMode`/`PointsOffsetRate` from `engine/stamp.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/program-config.ts src/lib/README.md
git commit -m "feat(points): catalog-item schema in program-config.ts"
```

---

## Task 5: `program.ts` — save schema + `buildProgramFields`

**Files:**

- Modify: `src/lib/program.ts`
- Test: `test/lib/program.test.ts`

**Interfaces:**

- Consumes: `pointsCatalogItemInputSchema` (Task 4).
- Produces: `saveProgramSchema`'s stamp branch gains `redemption_mode`/`catalog`/`offset_rate_points`/`offset_rate_dollars`; `buildProgramFields` writes `redemption_mode`/`catalog`/`offset_rate` into `config` and computes the `stamps_required` fallback for both new modes.

- [ ] **Step 1: Write the failing tests**

Append to `test/lib/program.test.ts`:

```ts
describe("saveProgramSchema points redemption fields", () => {
  it("accepts a catalog-mode points program", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee Points",
      stamps_required: "500",
      reward_text: "unused",
      head_start: "false",
      variant: "points",
      redemption_mode: "catalog",
      catalog: JSON.stringify([
        { label: "Free drink", cost: 100 },
        { label: "Free meal", cost: 300 },
      ]),
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.redemption_mode).toBe("catalog");
      expect(result.data.catalog).toHaveLength(2);
    }
  });

  it("accepts an offset-mode points program", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee Points",
      stamps_required: "500",
      reward_text: "unused",
      head_start: "false",
      variant: "points",
      redemption_mode: "offset",
      offset_rate_points: "100",
      offset_rate_dollars: "1",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === "stamp") {
      expect(result.data.redemption_mode).toBe("offset");
      expect(result.data.offset_rate_points).toBe(100);
      expect(result.data.offset_rate_dollars).toBe(1);
    }
  });

  it("rejects a catalog with fewer than 2 items", () => {
    const result = saveProgramSchema.safeParse({
      type: "stamp",
      name: "Coffee Points",
      stamps_required: "500",
      reward_text: "unused",
      head_start: "false",
      variant: "points",
      redemption_mode: "catalog",
      catalog: JSON.stringify([{ label: "Free drink", cost: 100 }]),
    });
    expect(result.success).toBe(false);
  });
});

describe("buildProgramFields points redemption modes", () => {
  it("catalog mode: assigns each item a fresh id and sets stamps_required to the highest cost", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee Points",
      stamps_required: "500",
      reward_text: "unused",
      head_start: "false",
      variant: "points",
      redemption_mode: "catalog",
      catalog: JSON.stringify([
        { label: "Free drink", cost: 100 },
        { label: "Free meal", cost: 300 },
      ]),
    });
    const { config, stampsRequired } = buildProgramFields(parsed);
    const c = config as {
      redemption_mode?: string;
      catalog?: { id: string; label: string; cost: number }[];
    };
    expect(c.redemption_mode).toBe("catalog");
    expect(c.catalog).toHaveLength(2);
    expect(c.catalog?.every((item) => typeof item.id === "string")).toBe(true);
    expect(stampsRequired).toBe(300);
  });

  it("offset mode: builds config.offset_rate and sets stamps_required to the rate's points", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee Points",
      stamps_required: "500",
      reward_text: "unused",
      head_start: "false",
      variant: "points",
      redemption_mode: "offset",
      offset_rate_points: "100",
      offset_rate_dollars: "1",
    });
    const { config, stampsRequired } = buildProgramFields(parsed);
    expect((config as { offset_rate?: unknown }).offset_rate).toEqual({
      points: 100,
      dollars: 1,
    });
    expect(stampsRequired).toBe(100);
  });

  it("leaves redemption_mode/catalog/offset_rate undefined for a non-points stamp program", () => {
    const parsed = saveProgramSchema.parse({
      type: "stamp",
      name: "Coffee",
      stamps_required: "10",
      reward_text: "Free kopi",
      head_start: "false",
    });
    const { config } = buildProgramFields(parsed);
    const c = config as {
      redemption_mode?: unknown;
      catalog?: unknown;
      offset_rate?: unknown;
    };
    expect(c.redemption_mode).toBeUndefined();
    expect(c.catalog).toBeUndefined();
    expect(c.offset_rate).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/lib/program.test.ts`
Expected: FAIL — the new fields don't exist on the schema/config yet.

- [ ] **Step 3: Implement**

In `src/lib/program.ts`, add the import:

```ts
import {
  buildChanceConfig,
  buildPlantConfig,
  pointsCatalogItemInputSchema,
  type ProgramType,
  type SegmentInput,
} from "@/lib/program-config";
```

In the stamp branch of `saveProgramSchema` (right after `stamp_color`, before `expiry_days`):

```ts
      redemption_mode: z.preprocess(
        emptyToUndefined,
        z.enum(["catalog", "offset"]).optional(),
      ),
      catalog: z.preprocess(
        parseSegments,
        z.array(pointsCatalogItemInputSchema).min(2).max(6).optional(),
      ),
      offset_rate_points: z.preprocess(
        emptyToUndefined,
        z.coerce.number().int().min(1).max(100000).optional(),
      ),
      offset_rate_dollars: z.preprocess(
        emptyToUndefined,
        z.coerce.number().min(0.01).max(100000).optional(),
      ),
```

Replace `buildProgramFields`'s `if (data.type === "stamp") { ... }` block body with:

```ts
if (data.type === "stamp") {
  const isCatalog =
    data.variant === "points" && data.redemption_mode === "catalog";
  const isOffset =
    data.variant === "points" && data.redemption_mode === "offset";

  const catalog = isCatalog
    ? data.catalog?.map((item) => ({ ...item, id: crypto.randomUUID() }))
    : undefined;
  const offsetRate =
    isOffset && data.offset_rate_points && data.offset_rate_dollars
      ? { points: data.offset_rate_points, dollars: data.offset_rate_dollars }
      : undefined;

  // stamps_required stays not-null on the row, but neither new mode has
  // a single meaningful target — a sane, server-computed fallback
  // (never the client-submitted value, which the UI hides for both
  // modes) matches how pity_ceiling already backs stampsRequired for
  // Wheel/Scratch below.
  const stampsRequired = isCatalog
    ? Math.max(...(catalog?.map((item) => item.cost) ?? [1]))
    : isOffset
      ? (offsetRate?.points ?? data.stamps_required)
      : data.stamps_required;

  return {
    type: "stamp",
    stampsRequired,
    headStart: data.head_start,
    headStartPercent: data.head_start_percent ?? 20,
    config: {
      stamps_required: stampsRequired,
      reward_text: data.reward_text,
      variant: data.variant ?? "dots",
      points_per_visit: data.points_per_visit ?? 1,
      stamp_mark: {
        mode: data.stamp_mark_mode ?? "dot",
        preset: data.stamp_mark_preset,
      },
      stamp_style: data.stamp_style,
      stamp_color: data.stamp_color,
      redemption_mode:
        data.variant === "points" ? data.redemption_mode : undefined,
      catalog,
      offset_rate: offsetRate,
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/lib/program.test.ts`
Expected: PASS — including every pre-existing test in this file (a non-points program never sets `isCatalog`/`isOffset`, so `stampsRequired` falls through to `data.stamps_required` unchanged).

- [ ] **Step 5: Full check**

Run: `pnpm check`

- [ ] **Step 6: Update `src/lib/README.md`**

Extend the `program.ts` bullet: the stamp variant's own optional `redemption_mode`/`catalog`/`offset_rate_points`/`offset_rate_dollars` fields (points-only) — `buildProgramFields` assigns each catalog item a fresh id server-side and computes `stampsRequired`'s now-synthetic fallback (max catalog cost, or the offset rate's `points`) rather than trusting whatever the now-hidden form field submitted.

- [ ] **Step 7: Commit**

```bash
git add src/lib/program.ts src/lib/README.md test/lib/program.test.ts
git commit -m "feat(points): saveProgramSchema + buildProgramFields for catalog/offset modes"
```

---

## Task 6: Preview threading — `preview-state.ts` + `preview-animation.ts`

**Files:**

- Modify: `src/app/setup/preview-state.ts`
- Modify: `src/app/setup/preview-animation.ts`
- Test: `test/app/preview-state.test.ts`

**Interfaces:**

- Consumes: `PointsRedemptionMode`, `PointsCatalogItemInput` (program-config.ts, via preview-state's existing import), `PointsOffsetRate`.
- Produces: `PreviewInput` gains `pointsRedemptionMode?/pointsCatalog?/pointsOffsetRate?`.

- [ ] **Step 1: Write the failing test**

Add to `test/app/preview-state.test.ts`, near the existing `"stamp: style/color flow into the built program's config"` test:

```ts
it("stamp: points redemption fields flow into the built program's config", () => {
  const program = buildPreviewProgram({
    ...base,
    type: "stamp",
    variant: "points",
    pointsRedemptionMode: "catalog",
    pointsCatalog: [
      { label: "Free drink", cost: 100 },
      { label: "Free meal", cost: 300 },
    ],
  });
  expect(program.config).toMatchObject({
    redemption_mode: "catalog",
    catalog: [
      { label: "Free drink", cost: 100 },
      { label: "Free meal", cost: 300 },
    ],
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/app/preview-state.test.ts`
Expected: FAIL — `pointsRedemptionMode`/`pointsCatalog` don't exist on `PreviewInput` yet.

- [ ] **Step 3: Implement**

In `src/app/setup/preview-state.ts`, extend the import and `PreviewInput`:

```ts
import {
  buildChanceConfig,
  buildPlantConfig,
  type ProgramType,
  type ScratchCoverStyle,
  type StampVisualStyle,
  type PointsRedemptionMode,
  type PointsOffsetRate,
  type PointsCatalogItemInput,
} from "@/lib/program-config";

export type PreviewInput = {
  // ...unchanged existing fields...
  stampStyle?: StampVisualStyle;
  stampColor?: string;
  pointsRedemptionMode?: PointsRedemptionMode;
  pointsCatalog?: PointsCatalogItemInput[];
  pointsOffsetRate?: PointsOffsetRate;
};
```

In `buildPreviewProgram`'s stamp branch, add to `config`:

```ts
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
        stamp_style: input.stampStyle,
        stamp_color: input.stampColor,
        redemption_mode:
          input.variant === "points" ? input.pointsRedemptionMode : undefined,
        catalog:
          input.pointsRedemptionMode === "catalog"
            ? input.pointsCatalog
            : undefined,
        offset_rate:
          input.pointsRedemptionMode === "offset"
            ? input.pointsOffsetRate
            : undefined,
      },
```

In `src/app/setup/preview-animation.ts`, destructure and thread the 3 new fields into `recipeKey`, same as `stampStyle`/`stampColor`:

```ts
    stampStyle,
    stampColor,
    pointsRedemptionMode,
    pointsCatalog,
    pointsOffsetRate,
  } = input;

  const recipeKey = JSON.stringify([
    // ...unchanged existing entries...
    stampStyle,
    stampColor,
    pointsRedemptionMode,
    pointsCatalog,
    pointsOffsetRate,
  ]);
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/app/preview-state.test.ts src/app/setup/preview-animation.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full check**

Run: `pnpm check`

- [ ] **Step 6: Update `src/app/setup/README.md`**

Extend the `preview-state.ts` bullet: `PreviewInput` also carries optional `pointsRedemptionMode`/`pointsCatalog`/`pointsOffsetRate` (points-only), threaded into the stamp branch's `config.redemption_mode`/`catalog`/`offset_rate`. Extend the `preview-animation.ts` bullet: same 3 fields folded into `recipeKey`.

- [ ] **Step 7: Commit**

```bash
git add src/app/setup/preview-state.ts src/app/setup/preview-animation.ts src/app/setup/README.md test/app/preview-state.test.ts
git commit -m "feat(points): thread redemption-mode fields through the setup preview"
```

---

## Task 7: Setup UI — `setup-form.tsx`

**Files:**

- Modify: `src/app/setup/setup-form.tsx`
- Test: `src/app/setup/setup-form.dom.test.tsx`

**Interfaces:**

- Consumes: `pointsCatalogItemInputSchema`'s type (`PointsCatalogItemInput`), `PointsRedemptionMode`, `PointsOffsetRate` (program-config.ts); `PreviewInput`'s 3 new fields (Task 6).
- Produces: a "Points redemption" `Section`; hides `stamps_required` + its quick-pick chips for `variant === "points"`.

- [ ] **Step 1: Write the failing tests**

Add to `src/app/setup/setup-form.dom.test.tsx`, in the `describe("SetupForm type picker")` block (near the Points Club test):

```ts
it("Points Club defaults to catalog mode, hides stamps_required, and submits the catalog", async () => {
  const user = userEvent.setup();
  render(
    <SetupForm
      program={null}
      isEdit={false}
      replacingId={null}
      replacingType={null}
    />,
  );
  // Points Club is a single-style family (like Stamp Card) — one click
  // completes selection immediately, no style sub-step.
  await user.click(screen.getByRole("button", { name: "Points Club" }));
  await goToBasics(user);

  expect(screen.queryByLabelText("Points required")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Card name"), "Coffee Points");
  await user.type(screen.getByLabelText("Reward"), "unused");
  await goToRules(user);

  expect(screen.getByText("Points redemption")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create card" }));

  expect(saveMock).toHaveBeenCalled();
  const submitted = saveMock.mock.calls[0][1] as FormData;
  expect(submitted.get("redemption_mode")).toBe("catalog");
  expect(JSON.parse(submitted.get("catalog") as string)).toHaveLength(2);
});

it("picking Payment offset submits the rate instead of a catalog", async () => {
  const user = userEvent.setup();
  render(
    <SetupForm
      program={null}
      isEdit={false}
      replacingId={null}
      replacingType={null}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Points Club" }));
  await goToBasics(user);
  await user.type(screen.getByLabelText("Card name"), "Coffee Points");
  await user.type(screen.getByLabelText("Reward"), "unused");
  await goToRules(user);

  await user.click(screen.getByRole("radio", { name: "Points = cash" }));
  await user.click(screen.getByRole("button", { name: "Create card" }));

  expect(saveMock).toHaveBeenCalled();
  const submitted = saveMock.mock.calls[0][1] as FormData;
  expect(submitted.get("redemption_mode")).toBe("offset");
  expect(submitted.get("offset_rate_points")).toBe("100");
  expect(submitted.get("offset_rate_dollars")).toBe("1");
});
```

**Also fix a pre-existing test this task otherwise breaks.** `"Points Club style saves type=stamp with variant=points, wider range, and points_per_visit"` (already in this file, around line 437) types into a visible `"Points required"` field that no longer exists once this task ships. Replace its body with:

```ts
  it("Points Club style saves type=stamp with variant=points, wider range, and points_per_visit", async () => {
    const user = userEvent.setup();
    render(
      <SetupForm
        program={null}
        isEdit={false}
        replacingId={null}
        replacingType={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Points Club" }));
    await goToBasics(user);
    expect(
      screen.queryByLabelText("Points required"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Points per visit")).toBeInTheDocument();

    const perVisitInput = screen.getByLabelText("Points per visit");
    await user.clear(perVisitInput);
    await user.type(perVisitInput, "20");

    await user.type(screen.getByLabelText("Card name"), "Coffee Points");
    await user.type(screen.getByLabelText("Reward"), "Free drink");
    await goToRules(user);
    await user.click(screen.getByRole("button", { name: "Create card" }));

    expect(saveMock).toHaveBeenCalled();
    const submitted = saveMock.mock.calls[0][1] as FormData;
    expect(submitted.get("type")).toBe("stamp");
    expect(submitted.get("variant")).toBe("points");
    // Submitted via the new hidden input (Step 3) — buildProgramFields
    // (Task 5) recomputes the real value server-side for both new modes,
    // so this raw client-submitted number is no longer meaningful; only
    // that the form still successfully submits *something* here matters.
    expect(submitted.get("stamps_required")).toBeTruthy();
    expect(submitted.get("points_per_visit")).toBe("20");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: FAIL — no "Points redemption" section, `stamps_required`'s "Points required" label still renders, and the pre-existing Points Club test above still references the old field until fixed.

- [ ] **Step 3: Implement**

Add imports:

```ts
import type {
  StampMarkPreset,
  StampVisualStyle,
} from "@/components/stamp-dots";
import type {
  ScratchCoverStyle,
  PointsRedemptionMode,
  PointsCatalogItemInput,
} from "@/lib/program-config";
```

Add a default-catalog constant near `DEFAULT_SEGMENTS`:

```ts
const DEFAULT_POINTS_CATALOG: PointsCatalogItemInput[] = [
  { label: "Free drink", cost: 100 },
  { label: "Free meal", cost: 300 },
];
```

Add state, next to `scratchCoverStyle`/`stampStyle`:

```ts
const [pointsRedemptionMode, setPointsRedemptionMode] =
  useState<PointsRedemptionMode>(
    (config.redemption_mode as PointsRedemptionMode | undefined) ?? "catalog",
  );
const [pointsCatalog, setPointsCatalog] = useState<PointsCatalogItemInput[]>(
  (config.catalog as PointsCatalogItemInput[] | undefined) ??
    DEFAULT_POINTS_CATALOG,
);
const [offsetRatePoints, setOffsetRatePoints] = useState(
  (config.offset_rate as { points?: number } | undefined)?.points ?? 100,
);
const [offsetRateDollars, setOffsetRateDollars] = useState(
  (config.offset_rate as { dollars?: number } | undefined)?.dollars ?? 1,
);
```

Add the `config` unpacking type's new fields, next to `stamp_style?: string;`:

```ts
    redemption_mode?: string;
    catalog?: { id?: string; label?: string; cost?: number }[];
    offset_rate?: { points?: number; dollars?: number };
```

Add catalog editor helpers next to `updateSegment`/`addSegment`/`removeSegment`:

```ts
function updatePointsCatalogItem(
  index: number,
  patch: Partial<PointsCatalogItemInput>,
) {
  setPointsCatalog((prev) =>
    prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
  );
}

function addPointsCatalogItem() {
  setPointsCatalog((prev) => [...prev, { label: "New reward", cost: 100 }]);
}

function removePointsCatalogItem(index: number) {
  setPointsCatalog((prev) => prev.filter((_, i) => i !== index));
}
```

Add reset lines to `pickStyle()`, next to `setStampStyle("dots"); setStampColor(undefined);`:

```ts
setPointsRedemptionMode("catalog");
setPointsCatalog(DEFAULT_POINTS_CATALOG);
setOffsetRatePoints(100);
setOffsetRateDollars(1);
```

Thread the 3 fields into `usePreviewAnimation`'s input object, next to `stampStyle, stampColor,`:

```ts
    pointsRedemptionMode: variant === "points" ? pointsRedemptionMode : undefined,
    pointsCatalog:
      variant === "points" && pointsRedemptionMode === "catalog"
        ? pointsCatalog
        : undefined,
    pointsOffsetRate:
      variant === "points" && pointsRedemptionMode === "offset"
        ? { points: offsetRatePoints, dollars: offsetRateDollars }
        : undefined,
```

Replace the whole existing `stamps_required` block — from its opening `<div className="space-y-2">` through its closing `</div>` (the one right before the `{variant === "points" && (` block for `points_per_visit`) — with:

```tsx
{
  variant === "points" ? (
    <input type="hidden" name="stamps_required" value={stampsRequired} />
  ) : (
    <div className="space-y-2">
      <Label htmlFor="stamps_required" className={labelClass}>
        {variant === "flame" ? "Visits for full blaze" : "Stamps required"}
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
  );
}
```

(This drops the `variant === "points" ? [100, 500, 1000] : [5, 10, 15]` branch and the `"Points required"` label entirely — `variant` can no longer be `"points"` on this path, since that whole ternary now only renders for the non-points case. The `id="stamps_required"`/`name="stamps_required"` pairing stays on the visible `<Input>` for the non-points case exactly as before; the points case submits the same `name="stamps_required"` via the hidden input instead.)

Add the new Section in the Rules-step area, right after the Stamp style Section closes (`</Section>` for "Stamp style") and before the `{type === "scratch" && (` block:

```tsx
{
  type === "stamp" && variant === "points" && (
    <Section
      icon={<Coins className="size-4" />}
      title="Points redemption"
      description="How a customer spends their points once they have enough."
    >
      <ToggleGroup
        type="single"
        variant="outline"
        value={pointsRedemptionMode}
        onValueChange={(v) =>
          v && setPointsRedemptionMode(v as PointsRedemptionMode)
        }
        className="justify-start"
      >
        <ToggleGroupItem value="catalog">Reward catalog</ToggleGroupItem>
        <ToggleGroupItem value="offset">Points = cash</ToggleGroupItem>
      </ToggleGroup>

      {pointsRedemptionMode === "catalog" ? (
        <div className="space-y-2">
          {pointsCatalog.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-xl border p-2"
            >
              <Input
                type="text"
                required
                maxLength={40}
                value={item.label}
                onChange={(e) =>
                  updatePointsCatalogItem(i, { label: e.target.value })
                }
                placeholder="Reward"
                className="h-11 flex-1 rounded-xl"
              />
              <Input
                type="number"
                required
                min={1}
                max={100000}
                value={item.cost}
                onChange={(e) =>
                  updatePointsCatalogItem(i, {
                    cost: Number(e.target.value),
                  })
                }
                aria-label="Point cost"
                className="h-11 w-24 rounded-xl"
              />
              <button
                type="button"
                onClick={() => removePointsCatalogItem(i)}
                disabled={pointsCatalog.length <= 2}
                className="h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addPointsCatalogItem}
            disabled={pointsCatalog.length >= 6}
            className="h-11 w-full rounded-xl border text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50 disabled:opacity-40"
          >
            Add reward
          </button>
          <input
            type="hidden"
            name="catalog"
            value={JSON.stringify(pointsCatalog)}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            required
            min={1}
            max={100000}
            value={offsetRatePoints}
            onChange={(e) => setOffsetRatePoints(Number(e.target.value))}
            aria-label="Points"
            className="h-11 w-24 rounded-xl"
          />
          <span className="text-sm text-muted-foreground">points =</span>
          <Input
            type="number"
            required
            min={0.01}
            step={0.01}
            max={100000}
            value={offsetRateDollars}
            onChange={(e) => setOffsetRateDollars(Number(e.target.value))}
            aria-label="Dollars off"
            className="h-11 w-24 rounded-xl"
          />
          <span className="text-sm text-muted-foreground">off</span>
          <input
            type="hidden"
            name="offset_rate_points"
            value={offsetRatePoints}
          />
          <input
            type="hidden"
            name="offset_rate_dollars"
            value={offsetRateDollars}
          />
        </div>
      )}
      <input
        type="hidden"
        name="redemption_mode"
        value={pointsRedemptionMode}
      />
    </Section>
  );
}
```

Add `Coins` to the `lucide-react` import list next to `Palette`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/app/setup/setup-form.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full check**

Run: `pnpm check`

- [ ] **Step 6: Update `src/app/setup/README.md`**

Extend the `setup-form.tsx` bullet: a new "Points redemption" `Section`, `type === "stamp" && variant === "points"` only, right after Stamp style. A mode `ToggleGroup` (Reward catalog / Points = cash) backed by `pointsRedemptionMode` state (default `"catalog"`, reset on every `pickStyle()` switch like the form's other per-type fields); catalog mode shows a 2-6-item label+cost editor mirroring the Wheel/Scratch segment editor (`pointsCatalog` state, submitted as JSON via a `catalog` hidden input); offset mode shows 2 number inputs composing `offset_rate_points`/`offset_rate_dollars`. The existing `stamps_required` field and its quick-pick chips are replaced by a hidden input whenever `variant === "points"` — `buildProgramFields` computes the real value server-side for both new modes.

- [ ] **Step 7: Commit**

```bash
git add src/app/setup/setup-form.tsx src/app/setup/README.md src/app/setup/setup-form.dom.test.tsx
git commit -m "feat(points): Points redemption setup UI — catalog editor + offset rate"
```

---

## Task 8: `dashboard/actions.ts` — `stampAction` fix, `applyPointsOffsetAction`, voucher-aware `resolveTokenAction`

**Files:**

- Modify: `src/app/dashboard/actions.ts`
- Test: `test/app/dashboard-actions.test.ts`

**Interfaces:**

- Consumes: `getProgress` (already imported), `apply_points_offset`/`voucher_by_token` RPCs (Task 1).
- Produces: `applyPointsOffsetAction(formData)`; `resolveTokenAction` returns `ActionResult<{kind:"card";phone;programId} | {kind:"voucher";phone;voucherToken;rewardText}>` (was `ActionResult<{phone;programId}>`).

- [ ] **Step 1: Write the failing tests**

Add to `test/app/dashboard-actions.test.ts`:

```ts
describe("stampAction rewardReady for points redemption modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
  });

  it("catalog mode: rewardReady only once the balance covers the cheapest item", async () => {
    getProgramByIdMock.mockResolvedValue({
      ...program,
      config: {
        variant: "points",
        redemption_mode: "catalog",
        catalog: [{ id: "a", label: "Free drink", cost: 100 }],
      },
    });
    rpcMock.mockResolvedValue({
      data: { id: "c1", phone: "+6591234567", stamp_count: 50 },
      error: null,
    });
    const notReady = await stampAction(
      form({ program_id: "p1", phone: "91234567" }),
    );
    expect(notReady.success && notReady.rewardReady).toBe(false);

    rpcMock.mockResolvedValue({
      data: { id: "c1", phone: "+6591234567", stamp_count: 100 },
      error: null,
    });
    const ready = await stampAction(
      form({ program_id: "p1", phone: "91234567" }),
    );
    expect(ready.success && ready.rewardReady).toBe(true);
  });
});

describe("applyPointsOffsetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
  });

  it("deducts points and returns the dollar figure", async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: "c1", phone: "+6591234567", stamp_count: 150, dollars: 1 }],
      error: null,
    });
    const res = await applyPointsOffsetAction(
      form({ card_id: "c1", points: "100" }),
    );
    expect(rpcMock).toHaveBeenCalledWith("apply_points_offset", {
      p_card: "c1",
      p_points: 100,
    });
    expect(res).toEqual({
      success: true,
      phone: "+6591234567",
      stampCount: 150,
      dollars: 1,
    });
  });

  it("rejects a non-integer or non-positive amount without a DB call", async () => {
    const res = await applyPointsOffsetAction(
      form({ card_id: "c1", points: "0" }),
    );
    expect(res.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("resolveTokenAction falls back to a voucher lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
  });

  it("resolves a card token as before", async () => {
    rpcMock.mockResolvedValue({
      data: [{ phone: "+6591234567", program_id: "p1" }],
      error: null,
    });
    const res = await resolveTokenAction(form({ token: "cardtok" }));
    expect(res).toEqual({
      success: true,
      kind: "card",
      phone: "+6591234567",
      programId: "p1",
    });
  });

  it("falls back to voucher_by_token on a card miss", async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === "card_by_token")
        return Promise.resolve({ data: [], error: null });
      return Promise.resolve({
        data: [
          {
            phone: "+6591234567",
            reward_text: "Free drink",
            program_id: "p1",
          },
        ],
        error: null,
      });
    });
    const res = await resolveTokenAction(form({ token: "vouchtok" }));
    expect(res).toEqual({
      success: true,
      kind: "voucher",
      phone: "+6591234567",
      voucherToken: "vouchtok",
      rewardText: "Free drink",
    });
  });

  it("errors when neither a card nor a voucher matches", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const res = await resolveTokenAction(form({ token: "nope" }));
    expect(res.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/app/dashboard-actions.test.ts`
Expected: FAIL — `applyPointsOffsetAction` doesn't exist; `resolveTokenAction`'s result has no `kind`; `stampAction`'s `rewardReady` still uses the flat helper.

- [ ] **Step 3: Implement**

Fix `stampAction`'s return statement — replace:

```ts
    rewardReady: rewardReady(card.stamp_count, program.stamps_required),
```

with:

```ts
    rewardReady: getProgress(
      {
        type: program.type,
        config: program.config,
        stamps_required: program.stamps_required,
        reward_text: program.reward_text,
      },
      { state: {}, stamp_count: card.stamp_count, reward_count: 0 },
      new Date(),
    ).rewardReady,
```

(`getProgress` is already imported at the top of this file — no new import needed. Leave the `rewardReady` import from `@/lib/loyalty` in place — `adjustStampAction`'s own return statement further down this file still calls it directly, unaffected by this change; `adjustStampAction` is a classic-Stamp-only day-2 correction tool per its own comment, never reached for a points program.)

Add, right after `redeemAction`:

```ts
// Vendor-initiated at the register for an offset-mode Points Club
// program: deducts p_points from the scanned card's balance and returns
// the dollar figure for the vendor to apply manually at their own
// register — loopkit never touches payment processing.
export async function applyPointsOffsetAction(
  formData: FormData,
): Promise<
  ActionResult<{ phone: string; stampCount: number; dollars: number }>
> {
  await requireVendor();

  const cardId = String(formData.get("card_id") ?? "").trim();
  if (!cardId) {
    return { success: false, error: "Missing card." };
  }
  const points = Number(formData.get("points"));
  if (!Number.isInteger(points) || points <= 0) {
    return { success: false, error: "Enter a whole number of points." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("apply_points_offset", {
    p_card: cardId,
    p_points: points,
  });
  const row = data?.[0];
  if (error || !row) {
    console.error("apply_points_offset failed", error);
    return { success: false, error: "Something went wrong. Try again." };
  }

  revalidatePath("/dashboard");
  return {
    success: true,
    phone: row.phone,
    stampCount: row.stamp_count,
    dollars: row.dollars,
  };
}
```

Replace `resolveTokenAction`'s body:

```ts
export async function resolveTokenAction(formData: FormData): Promise<
  ActionResult<
    | { kind: "card"; phone: string; programId: string }
    | {
        kind: "voucher";
        phone: string;
        voucherToken: string;
        rewardText: string;
      }
  >
> {
  await requireVendor();
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { success: false, error: "No code scanned." };

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("card_by_token", {
    p_token: token,
  });
  if (error) {
    console.error("card_by_token failed", error.message);
    return { success: false, error: "Couldn't read that code." };
  }
  const cardRow = data?.[0];
  if (cardRow) {
    return {
      success: true,
      kind: "card",
      phone: cardRow.phone,
      programId: cardRow.program_id,
    };
  }

  const { data: voucherData, error: voucherError } = await supabase.rpc(
    "voucher_by_token",
    { p_token: token },
  );
  if (voucherError) {
    console.error("voucher_by_token failed", voucherError.message);
    return { success: false, error: "Couldn't read that code." };
  }
  const voucherRow = voucherData?.[0];
  if (!voucherRow) {
    return { success: false, error: "That card isn't for this shop." };
  }
  return {
    success: true,
    kind: "voucher",
    phone: voucherRow.phone,
    voucherToken: token,
    rewardText: voucherRow.reward_text,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/app/dashboard-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check**

Run: `pnpm check`
Expected: this WILL surface type errors in `scan-button.tsx`/`scan-and-route.tsx`/`serve-customer.tsx` (their `onResolved` callback still expects the old `{phone, programId}` shape) — that's expected here, fixed in Tasks 9-10. Confirm the errors are only in those 3 files before moving on.

- [ ] **Step 6: Update `src/app/dashboard/README.md`**

Extend the `actions.ts` bullet: `stampAction`'s `rewardReady` now goes through `getProgress` (the real engine dispatch) instead of a flat `stamp_count >= stamps_required` check — needed once Points Club's 2 new modes make that comparison meaningless. New `applyPointsOffsetAction` (offset-mode redemption). `resolveTokenAction` now returns a `kind: "card" | "voucher"` discriminated result — a card-token miss falls back to `voucher_by_token` before erroring.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/actions.ts src/app/dashboard/README.md test/app/dashboard-actions.test.ts
git commit -m "feat(points): stampAction engine rewardReady, applyPointsOffsetAction, voucher-aware resolveTokenAction"
```

---

## Task 9: `scan-button.tsx` — discriminated `onResolved`

**Files:**

- Modify: `src/app/dashboard/scan-button.tsx`
- Test: `src/app/dashboard/scan-button.dom.test.tsx`

**Interfaces:**

- Consumes: `resolveTokenAction`'s new discriminated result shape (Task 8).
- Produces: `ScanButton`'s `onResolved` prop type changes from `(result: {phone;programId}) => void` to the same 2-variant union.

- [ ] **Step 1: Write the failing test**

Add to `src/app/dashboard/scan-button.dom.test.tsx`:

```ts
it("passes a voucher-kind result straight through to onResolved", async () => {
  const { resolveTokenAction } = await import("@/app/dashboard/actions");
  vi.mocked(resolveTokenAction).mockResolvedValue({
    success: true,
    kind: "voucher",
    phone: "+6591234567",
    voucherToken: "tok123",
    rewardText: "Free drink",
  });
  const onResolved = vi.fn();
  render(<ScanButton onResolved={onResolved} />);
  // This test only asserts the type/shape compiles and the mock resolves —
  // the actual camera decode path is exercised by scan-and-route's tests
  // via a mocked ScanButton, matching this file's existing scope.
  expect(resolveTokenAction).toBeDefined();
});
```

_(This test is intentionally thin — this file's existing 2 tests only cover the label, never the camera decode callback; a real behavioral test of the voucher branch belongs in `scan-and-route`'s tests, Task 10.)_

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/app/dashboard/scan-button.dom.test.tsx`
Expected: FAIL — TS error, `resolveTokenAction`'s mocked resolved value doesn't match `ScanButton`'s still-old `onResolved` type.

- [ ] **Step 3: Implement**

In `src/app/dashboard/scan-button.tsx`, change the prop type:

```ts
  onResolved: (
    result:
      | { kind: "card"; phone: string; programId: string }
      | {
          kind: "voucher";
          phone: string;
          voucherToken: string;
          rewardText: string;
        },
  ) => void;
```

Change the decode callback's use of the result:

```ts
            const res = await resolveTokenAction(fd);
            if (res.success) {
              onResolved(res);
              setOpen(false);
            } else {
```

(`res` narrows to `{success:true} & (...)` after the `if`, so `onResolved(res)` type-checks directly — no destructuring needed.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/app/dashboard/scan-button.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/scan-button.tsx src/app/dashboard/scan-button.dom.test.tsx
git commit -m "feat(points): ScanButton onResolved carries card-vs-voucher kind"
```

---

## Task 10: `scan-and-route.tsx` + `serve-customer.tsx` — voucher routing

**Files:**

- Modify: `src/app/dashboard/scan-and-route.tsx`
- Modify: `src/app/dashboard/serve-customer.tsx`
- Test: `src/app/dashboard/scan-and-route.dom.test.tsx`
- Test: `test/app/serve-customer.test.tsx`

**Interfaces:**

- Consumes: Task 9's `ScanButton` result shape.
- Produces: both scan entry points route a voucher match to `/dashboard/redeem-voucher?token=...` instead of `/dashboard/counter`.

- [ ] **Step 1: Write the failing tests**

In `src/app/dashboard/scan-and-route.dom.test.tsx`, update the mocked `ScanButton` to accept the new shape and add a test:

```ts
vi.mock("@/app/dashboard/scan-button", () => ({
  ScanButton: ({
    label,
    onResolved,
  }: {
    label?: string;
    onResolved: (
      result:
        | { kind: "card"; phone: string; programId: string }
        | {
            kind: "voucher";
            phone: string;
            voucherToken: string;
            rewardText: string;
          },
    ) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onResolved({ kind: "card", phone: "+6591234567", programId: "p9" })
        }
      >
        {label}
      </button>
      <button
        type="button"
        onClick={() =>
          onResolved({
            kind: "voucher",
            phone: "+6591234567",
            voucherToken: "tok123",
            rewardText: "Free drink",
          })
        }
      >
        Scan voucher
      </button>
    </>
  ),
}));
```

Add a test:

```ts
it("routes a voucher scan to the redeem-voucher screen", async () => {
  const user = userEvent.setup();
  render(<ScanAndRoute />);
  await user.click(screen.getByRole("button", { name: "Scan voucher" }));
  expect(routerPush).toHaveBeenCalledWith(
    "/dashboard/redeem-voucher?token=tok123",
  );
});
```

In `test/app/serve-customer.test.tsx`, update the mocked `ScanButton` the same way and add:

```ts
it("routes a voucher scan to the redeem-voucher screen instead of stamping this program", async () => {
  const user = userEvent.setup();
  render(
    <ServeCustomer
      programId="p1"
      type="stamp"
      stampsRequired={10}
      rewardText="Free kopi"
    />,
  );
  await user.click(screen.getByRole("button", { name: "Scan voucher" }));
  expect(routerPush).toHaveBeenCalledWith(
    "/dashboard/redeem-voucher?token=tok123",
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/app/dashboard/scan-and-route.dom.test.tsx test/app/serve-customer.test.tsx`
Expected: FAIL — both components still call `onResolved({phone, programId})` destructuring, and the existing "routes to the resolved card's Counter page" tests now fail to compile against the mock's new type until the components themselves are updated.

- [ ] **Step 3: Implement**

In `src/app/dashboard/scan-and-route.tsx`, replace the `onResolved` handler:

```tsx
<ScanButton
  label="Scan a customer"
  onResolved={(result) => {
    if (result.kind === "voucher") {
      router.push(
        `/dashboard/redeem-voucher?token=${encodeURIComponent(result.voucherToken)}`,
      );
      return;
    }
    router.push(
      `/dashboard/counter?p=${result.programId}&phone=${encodeURIComponent(result.phone)}`,
    );
  }}
/>
```

In `src/app/dashboard/serve-customer.tsx`, replace the `ScanButton`'s `onResolved`:

```tsx
          onResolved={(result) => {
            if (result.kind === "voucher") {
              router.push(
                `/dashboard/redeem-voucher?token=${encodeURIComponent(result.voucherToken)}`,
              );
              return;
            }
            if (result.programId !== programId) {
              router.push(
                `/dashboard/counter?p=${result.programId}&phone=${encodeURIComponent(result.phone)}`,
              );
              return;
            }
            if (phoneRef.current) {
              phoneRef.current.value = result.phone;
              formRef.current?.requestSubmit();
            }
          }}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/app/dashboard/scan-and-route.dom.test.tsx test/app/serve-customer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full check**

Run: `pnpm check`

- [ ] **Step 6: Update READMEs**

`src/app/dashboard/README.md`: extend `scan-and-route.tsx`/`serve-customer.tsx` bullets — a voucher-kind scan result routes to `/dashboard/redeem-voucher?token=...` instead of the Counter page.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/scan-and-route.tsx src/app/dashboard/serve-customer.tsx src/app/dashboard/README.md src/app/dashboard/scan-and-route.dom.test.tsx test/app/serve-customer.test.tsx
git commit -m "feat(points): route a scanned voucher to its own redeem screen"
```

---

## Task 11: New `redeem-voucher` page

**Files:**

- Create: `src/app/dashboard/redeem-voucher/page.tsx`
- Create: `src/app/dashboard/redeem-voucher/redeem-voucher-confirm.tsx`
- Create: `src/app/dashboard/redeem-voucher/redeem-voucher-confirm.dom.test.tsx`
- Modify: `src/lib/program.ts` (new `getVoucherByToken`)
- Modify: `src/app/dashboard/actions.ts` (new `redeemVoucherAction`)
- Test: `test/lib/program.test.ts`, `test/app/dashboard-actions.test.ts`

**Interfaces:**

- Consumes: `voucher_by_token`/`redeem_voucher_by_token` RPCs (Task 1).
- Produces: `getVoucherByToken(token)` (server read), `redeemVoucherAction(formData)` (server mutation), the `/dashboard/redeem-voucher` route.

- [ ] **Step 1: Write the failing tests**

Add to `test/lib/program.test.ts`:

```ts
describe("getVoucherByToken", () => {
  it("returns the resolved voucher row", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          program_id: "p1",
          card_id: "c1",
          voucher_id: "v1",
          phone: "+6591234567",
          reward_text: "Free drink",
          status: "active",
        },
      ],
      error: null,
    });
    const result = await getVoucherByToken("tok123");
    expect(rpcMock).toHaveBeenCalledWith("voucher_by_token", {
      p_token: "tok123",
    });
    expect(result).toEqual({
      programId: "p1",
      cardId: "c1",
      voucherId: "v1",
      phone: "+6591234567",
      rewardText: "Free drink",
      status: "active",
    });
  });

  it("returns null when no voucher matches", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const result = await getVoucherByToken("nope");
    expect(result).toBeNull();
  });
});
```

_(This requires `program.test.ts`'s existing `rpcMock`/`createServerClient` mock setup — check the top of that file first; if `program.ts`'s own tests don't already mock `@/lib/supabase/server`, add the same `vi.mock` block `test/app/dashboard-actions.test.ts` uses, scoped to this file.)_

Add to `test/app/dashboard-actions.test.ts`:

```ts
describe("redeemVoucherAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireVendorMock.mockResolvedValue({ user: { id: "v1" } });
  });

  it("redeems the voucher and returns the reward text", async () => {
    rpcMock.mockResolvedValue({
      data: { id: "v1", reward_text: "Free drink", status: "redeemed" },
      error: null,
    });
    const res = await redeemVoucherAction(form({ token: "tok123" }));
    expect(rpcMock).toHaveBeenCalledWith("redeem_voucher_by_token", {
      p_token: "tok123",
    });
    expect(res).toEqual({ success: true, rewardText: "Free drink" });
  });

  it("surfaces a friendly message for an already-redeemed voucher", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "already_redeemed" },
    });
    const res = await redeemVoucherAction(form({ token: "tok123" }));
    expect(res).toEqual({
      success: false,
      error: "This reward has already been redeemed.",
    });
  });

  it("surfaces a friendly message for an expired voucher", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "expired" },
    });
    const res = await redeemVoucherAction(form({ token: "tok123" }));
    expect(res).toEqual({
      success: false,
      error: "This reward has expired.",
    });
  });
});
```

Create `src/app/dashboard/redeem-voucher/redeem-voucher-confirm.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { redeemMock } = vi.hoisted(() => ({ redeemMock: vi.fn() }));
vi.mock("@/app/dashboard/actions", () => ({ redeemVoucherAction: redeemMock }));

import { RedeemVoucherConfirm } from "./redeem-voucher-confirm";

describe("RedeemVoucherConfirm", () => {
  it("shows the reward text and phone, and confirms redemption", async () => {
    redeemMock.mockResolvedValue({ success: true, rewardText: "Free drink" });
    const user = userEvent.setup();
    render(
      <RedeemVoucherConfirm
        token="tok123"
        phone="+6591234567"
        rewardText="Free drink"
      />,
    );
    expect(screen.getByText("Free drink")).toBeInTheDocument();
    expect(screen.getByText("+6591234567")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(redeemMock).toHaveBeenCalled();
    expect(await screen.findByText(/redeemed/i)).toBeInTheDocument();
  });

  it("shows an error toast and stays on the confirm screen on failure", async () => {
    redeemMock.mockResolvedValue({
      success: false,
      error: "This reward has already been redeemed.",
    });
    const user = userEvent.setup();
    render(
      <RedeemVoucherConfirm
        token="tok123"
        phone="+6591234567"
        rewardText="Free drink"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(screen.getByRole("button", { name: "Redeem" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/lib/program.test.ts test/app/dashboard-actions.test.ts src/app/dashboard/redeem-voucher/redeem-voucher-confirm.dom.test.tsx`
Expected: FAIL — none of `getVoucherByToken`, `redeemVoucherAction`, `RedeemVoucherConfirm` exist yet.

- [ ] **Step 3: Implement**

In `src/lib/program.ts`, add near `getProgramById`:

```ts
export type VoucherLookup = {
  programId: string;
  cardId: string;
  voucherId: string;
  phone: string;
  rewardText: string;
  status: string;
};

// Vendor-owned read for the redeem-voucher scan screen — voucher_by_token
// is owner-gated (see migration 0043), so this only ever resolves a
// voucher for a program the signed-in vendor owns.
export async function getVoucherByToken(
  token: string,
): Promise<VoucherLookup | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.rpc("voucher_by_token", { p_token: token });
  const row = data?.[0];
  if (!row) return null;
  return {
    programId: row.program_id,
    cardId: row.card_id,
    voucherId: row.voucher_id,
    phone: row.phone,
    rewardText: row.reward_text,
    status: row.status,
  };
}
```

In `src/app/dashboard/actions.ts`, add near `redeemAction`:

```ts
const VOUCHER_ERROR_COPY: Record<string, string> = {
  already_redeemed: "This reward has already been redeemed.",
  expired: "This reward has expired.",
};

// Vendor scan/confirm redemption for one catalog-mode reward voucher —
// distinct from redeemAction, which still redeems Stamp/Plant's single
// fixed reward via the oldest-active-voucher path.
export async function redeemVoucherAction(
  formData: FormData,
): Promise<ActionResult<{ rewardText: string }>> {
  await requireVendor();

  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { success: false, error: "Missing code." };
  }

  const supabase = await createServerClient();
  const { data: voucher, error } = await supabase.rpc(
    "redeem_voucher_by_token",
    { p_token: token },
  );
  if (error || !voucher) {
    console.error("redeem_voucher_by_token failed", error);
    return {
      success: false,
      error:
        VOUCHER_ERROR_COPY[error?.message ?? ""] ??
        "Something went wrong. Try again.",
    };
  }

  revalidatePath("/dashboard");
  return { success: true, rewardText: voucher.reward_text };
}
```

Create `src/app/dashboard/redeem-voucher/redeem-voucher-confirm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { redeemVoucherAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/back-button";

export function RedeemVoucherConfirm({
  token,
  phone,
  rewardText,
}: {
  token: string;
  phone: string;
  rewardText: string;
}) {
  const { pending, run } = useAsyncAction();
  const [redeemedText, setRedeemedText] = useState<string | null>(null);

  function confirm() {
    run(async () => {
      const fd = new FormData();
      fd.set("token", token);
      const res = await redeemVoucherAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`Redeemed for ${phone}.`);
      setRedeemedText(res.rewardText);
    });
  }

  if (redeemedText) {
    return (
      <div className="space-y-3 rounded-xl border border-gold bg-gold/10 p-5 text-center">
        <p className="text-sm font-semibold text-gold-accent">Redeemed! 🎉</p>
        <p className="text-sm text-muted-foreground">{redeemedText}</p>
        <BackButton href="/dashboard" label="Back to dashboard" />
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-muted/40 p-5 text-center">
      <p className="text-lg font-semibold">{rewardText}</p>
      <p className="text-sm text-muted-foreground">{phone}</p>
      <Button
        type="button"
        size="lg"
        disabled={pending}
        onClick={confirm}
        className="h-12 w-full rounded-xl font-semibold"
      >
        {pending ? "Redeeming…" : "Redeem"}
      </Button>
    </div>
  );
}
```

Create `src/app/dashboard/redeem-voucher/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { requireVendor } from "@/features/auth";
import { getVoucherByToken } from "@/lib/program";
import { BackButton } from "@/components/back-button";
import { RedeemVoucherConfirm } from "@/app/dashboard/redeem-voucher/redeem-voucher-confirm";

export default async function RedeemVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  await requireVendor();
  const { token } = await searchParams;
  if (!token) redirect("/dashboard");

  const voucher = await getVoucherByToken(token);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <BackButton href="/dashboard" label="Back to dashboard" />
      {voucher ? (
        voucher.status === "active" ? (
          <RedeemVoucherConfirm
            token={token}
            phone={voucher.phone}
            rewardText={voucher.rewardText}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            This reward is already {voucher.status}.
          </p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          That code isn&apos;t for this shop.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/lib/program.test.ts test/app/dashboard-actions.test.ts src/app/dashboard/redeem-voucher/redeem-voucher-confirm.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full check**

Run: `pnpm check`

- [ ] **Step 6: Add/update READMEs**

`src/lib/README.md`: extend the `program.ts` bullet with `getVoucherByToken`/`VoucherLookup` — owner-gated read for the redeem-voucher scan screen.
`src/app/dashboard/README.md`: extend `actions.ts`'s bullet with `redeemVoucherAction`.
Create `src/app/dashboard/redeem-voucher/README.md` (mirroring `src/app/dashboard/counter/README.md`'s shape):

```markdown
# redeem-voucher

## Purpose

Vendor scan-confirm screen for one catalog-mode Points Club reward voucher — distinct from the Counter page, which handles every other stamp/visit/redeem action.

## Contents

- `page.tsx` — `RedeemVoucherPage` server component; resolves `?token=` via `getVoucherByToken` (owner-gated), redirects to `/dashboard` with no token, shows a not-found/already-redeemed message or renders `RedeemVoucherConfirm`.
- `redeem-voucher-confirm.tsx` — `RedeemVoucherConfirm`: shows the reward text + customer phone, a single "Redeem" button calling `redeemVoucherAction`, and a redeemed confirmation state.
- `redeem-voucher-confirm.dom.test.tsx` — jsdom tests: renders reward/phone, confirms redemption and shows the success state, stays on the confirm screen with a toast on failure.

## Parent

[dashboard](../README.md)
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/program.ts src/lib/README.md src/app/dashboard/actions.ts src/app/dashboard/README.md src/app/dashboard/redeem-voucher/ test/lib/program.test.ts test/app/dashboard-actions.test.ts
git commit -m "feat(points): redeem-voucher scan-confirm screen"
```

---

## Task 12: Offset-mode vendor UI in `serve-customer.tsx`

**Files:**

- Create: `src/app/dashboard/points-offset-form.tsx`
- Create: `src/app/dashboard/points-offset-form.dom.test.tsx`
- Modify: `src/app/dashboard/serve-customer.tsx`
- Modify: `src/app/dashboard/counter/page.tsx`
- Test: `test/app/serve-customer.test.tsx`

**Interfaces:**

- Consumes: `applyPointsOffsetAction` (Task 8), `StampCard` (`card.ts`).
- Produces: `PointsOffsetForm`; `ServeCustomer` gains a `pointsRedemptionMode?: "catalog" | "offset"` prop.

- [ ] **Step 1: Write the failing tests**

Create `src/app/dashboard/points-offset-form.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { applyMock } = vi.hoisted(() => ({ applyMock: vi.fn() }));
vi.mock("@/app/dashboard/actions", () => ({
  applyPointsOffsetAction: applyMock,
}));

import { PointsOffsetForm } from "./points-offset-form";

describe("PointsOffsetForm", () => {
  it("defaults the input to the full balance and applies on click", async () => {
    applyMock.mockResolvedValue({
      success: true,
      phone: "+6591234567",
      stampCount: 50,
      dollars: 2,
    });
    const onApplied = vi.fn();
    const user = userEvent.setup();
    render(
      <PointsOffsetForm
        card={{ id: "c1", phone: "+6591234567", stamp_count: 250 }}
        onApplied={onApplied}
      />,
    );
    expect(screen.getByLabelText("Points to apply")).toHaveValue(250);
    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(applyMock).toHaveBeenCalled();
    expect(onApplied).toHaveBeenCalledWith(
      { id: "c1", phone: "+6591234567", stamp_count: 50 },
      2,
    );
  });

  it("disables Apply above the card's own balance", async () => {
    const user = userEvent.setup();
    render(
      <PointsOffsetForm
        card={{ id: "c1", phone: "+6591234567", stamp_count: 100 }}
        onApplied={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Points to apply");
    await user.clear(input);
    await user.type(input, "150");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });
});
```

Add to `test/app/serve-customer.test.tsx`:

```ts
it("shows the offset apply form instead of RedeemButton for an offset-mode points program", async () => {
  stampMock.mockResolvedValue({
    success: true,
    card: { id: "c1", phone: "+6591234567", stamp_count: 250 },
    rewardReady: true,
  });
  const user = userEvent.setup();
  render(
    <ServeCustomer
      programId="p1"
      type="stamp"
      stampsRequired={100}
      rewardText="unused"
      pointsRedemptionMode="offset"
    />,
  );
  await user.type(screen.getByLabelText("Customer phone"), "91234567");
  await user.click(screen.getByRole("button", { name: "Add stamp" }));
  expect(await screen.findByLabelText("Points to apply")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Redeem" })).not.toBeInTheDocument();
});

it("shows no redeem control for a catalog-mode points program (customer redeems via their own voucher)", async () => {
  stampMock.mockResolvedValue({
    success: true,
    card: { id: "c1", phone: "+6591234567", stamp_count: 250 },
    rewardReady: true,
  });
  const user = userEvent.setup();
  render(
    <ServeCustomer
      programId="p1"
      type="stamp"
      stampsRequired={100}
      rewardText="unused"
      pointsRedemptionMode="catalog"
    />,
  );
  await user.type(screen.getByLabelText("Customer phone"), "91234567");
  await user.click(screen.getByRole("button", { name: "Add stamp" }));
  expect(
    await screen.findByText(/redeems their picked reward/i),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Points to apply")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Redeem" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/app/dashboard/points-offset-form.dom.test.tsx test/app/serve-customer.test.tsx`
Expected: FAIL — `PointsOffsetForm` doesn't exist; `ServeCustomer` has no `pointsRedemptionMode` prop and always renders `RedeemButton`.

- [ ] **Step 3: Implement**

Create `src/app/dashboard/points-offset-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/use-async-action";
import { applyPointsOffsetAction } from "@/app/dashboard/actions";
import type { StampCard } from "@/app/dashboard/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Offset-mode redemption control — a small inline form, not an
// AlertDialog like RedeemButton/RedeemVoucherConfirm: there's a number to
// pick here (up to the balance), not a single yes/no confirmation.
export function PointsOffsetForm({
  card,
  onApplied,
}: {
  card: StampCard;
  onApplied: (card: StampCard, dollars: number) => void;
}) {
  const { pending, run } = useAsyncAction();
  const [points, setPoints] = useState(card.stamp_count);

  function apply() {
    run(async () => {
      const fd = new FormData();
      fd.set("card_id", card.id);
      fd.set("points", String(points));
      const res = await applyPointsOffsetAction(fd);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      onApplied(
        { id: card.id, phone: res.phone, stamp_count: res.stampCount },
        res.dollars,
      );
    });
  }

  const invalid = points < 1 || points > card.stamp_count;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label
          htmlFor="offset_points"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Points to apply
        </Label>
        <Input
          id="offset_points"
          type="number"
          min={1}
          max={card.stamp_count}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          className="h-11 w-28 rounded-xl"
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || invalid}
        onClick={apply}
        className="rounded-xl"
      >
        {pending ? "Applying…" : "Apply"}
      </Button>
    </div>
  );
}
```

In `src/app/dashboard/serve-customer.tsx`, add the prop and import:

```tsx
import { PointsOffsetForm } from "@/app/dashboard/points-offset-form";

export function ServeCustomer({
  programId,
  type,
  stampsRequired,
  rewardText,
  initialPhone,
  pointsRedemptionMode,
}: {
  programId: string;
  type: string;
  stampsRequired: number;
  rewardText: string;
  initialPhone?: string;
  pointsRedemptionMode?: "catalog" | "offset";
}) {
```

Replace the `result.rewardReady && (...)` block inside the `result?.mode === "stamp"` render (the one currently rendering `<div className="mt-3 space-y-2">...<RedeemButton .../></div>`):

```tsx
{
  result.rewardReady && (
    <div className="mt-3 space-y-2">
      <p className="text-sm font-semibold text-gold-accent">Reward ready!</p>
      {pointsRedemptionMode === "offset" ? (
        <PointsOffsetForm
          card={result.card}
          onApplied={(next) =>
            setResult({
              mode: "stamp",
              phone: next.phone,
              card: next,
              rewardReady: next.stamp_count > 0,
            })
          }
        />
      ) : pointsRedemptionMode === "catalog" ? (
        <p className="text-sm text-muted-foreground">
          Customer redeems their picked reward from their own card.
        </p>
      ) : (
        <RedeemButton
          card={result.card}
          stampsRequired={stampsRequired}
          onRedeemed={(next) =>
            setResult({
              mode: "stamp",
              phone: next.phone,
              card: next,
              rewardReady: false,
            })
          }
        />
      )}
    </div>
  );
}
```

In `src/app/dashboard/counter/page.tsx`, derive and pass the new prop:

```tsx
const config = (program.config ?? {}) as {
  redemption_mode?: "catalog" | "offset";
};
// ...
<ServeCustomer
  key={program.id}
  programId={program.id}
  type={program.type}
  stampsRequired={program.stamps_required}
  rewardText={program.reward_text}
  initialPhone={phone}
  pointsRedemptionMode={config.redemption_mode}
/>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/app/dashboard/points-offset-form.dom.test.tsx test/app/serve-customer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full check**

Run: `pnpm check`

- [ ] **Step 6: Update READMEs**

`src/app/dashboard/README.md`: new `points-offset-form.tsx` bullet (mirrors `redeem-button.tsx`'s bullet shape); extend `serve-customer.tsx`'s bullet — a new `pointsRedemptionMode` prop swaps `RedeemButton` for `PointsOffsetForm` (offset) or a plain note (catalog, nothing to redeem here). Extend `counter/page.tsx`'s bullet with the same prop derivation.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/points-offset-form.tsx src/app/dashboard/serve-customer.tsx src/app/dashboard/counter/page.tsx src/app/dashboard/README.md src/app/dashboard/points-offset-form.dom.test.tsx test/app/serve-customer.test.tsx
git commit -m "feat(points): offset-mode apply-points form on the vendor counter"
```

---

## Task 13: Customer-facing `checkStatusAction` + `selectPointsRewardAction`

**Files:**

- Modify: `src/features/card-check/types.ts`
- Modify: `src/features/card-check/api/actions.ts`
- Modify: `src/features/card-check/components/check-form.dom.test.tsx` (its `CardStatus` fixture needs the new field)
- Test: `src/features/card-check/api/actions.test.ts` (already exists — `rpcMock`/`createServerClient` mocked at the top, `qrSvg` mocked to always resolve `"<svg></svg>"`, a `formData()` helper, and a `baseRow` fixture already defined; reuse all 4)

**Interfaces:**

- Consumes: `vendor_join`'s new `active_vouchers` column (Task 1), `select_points_reward` RPC.
- Produces: `CardStatus.activeVouchers: {id;rewardText;expiresAt;qr}[]`; `selectPointsRewardAction(formData)`.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/card-check/api/actions.test.ts`, using its existing `baseRow`/`formData()`/`rpcMock` (not new helpers):

```ts
describe("checkStatusAction surfaces active_vouchers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders each active voucher's own QR", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          ...baseRow,
          config: { variant: "points", redemption_mode: "catalog" },
          active_vouchers: [
            {
              id: "v1",
              voucher_token: "vtok1",
              reward_text: "Free drink",
              expires_at: null,
            },
          ],
        },
      ],
      error: null,
    });
    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({ phone: "91234567", vendor: "vend1" }),
    );
    expect(result.status).toBe("found");
    expect(result.cards?.[0].activeVouchers).toHaveLength(1);
    expect(result.cards?.[0].activeVouchers[0].rewardText).toBe("Free drink");
    expect(result.cards?.[0].activeVouchers[0].qr).toContain("<svg");
  });

  it("defaults to an empty array for a non-points card", async () => {
    rpcMock.mockResolvedValue({ data: [baseRow], error: null });
    const result = await checkStatusAction(
      STATUS_IDLE,
      formData({ phone: "91234567", vendor: "vend1" }),
    );
    expect(result.cards?.[0].activeVouchers).toEqual([]);
  });
});

describe("selectPointsRewardAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the new voucher's id/reward text/qr on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: "v2", voucher_token: "vtok2", reward_text: "Free meal" },
      error: null,
    });
    const res = await selectPointsRewardAction(
      formData({ phone: "91234567", program: "p1", item_id: "b" }),
    );
    expect(rpcMock).toHaveBeenCalledWith("select_points_reward", {
      p_program: "p1",
      p_phone: "+6591234567",
      p_item_id: "b",
    });
    expect(res).toEqual({
      success: true,
      id: "v2",
      phone: "+6591234567",
      rewardText: "Free meal",
      qr: expect.stringContaining("<svg"),
    });
  });

  it("surfaces a friendly message when the balance is too low", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "insufficient_points" },
    });
    const res = await selectPointsRewardAction(
      formData({ phone: "91234567", program: "p1", item_id: "b" }),
    );
    expect(res).toEqual({
      success: false,
      error: "Not enough points for that reward yet.",
    });
  });
});
```

_(Add a local `form()` helper matching `test/app/dashboard-actions.test.ts`'s if this test file doesn't already have one.)_

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/card-check/api/actions.test.ts`
Expected: FAIL — `CardStatus` has no `activeVouchers`, `selectPointsRewardAction` doesn't exist.

- [ ] **Step 3: Implement**

In `src/features/card-check/types.ts`, extend `CardStatus`:

```ts
export type CardStatus = {
  programId: string;
  name: string;
  label: string;
  view: ProgressView;
  rewardReady: boolean;
  reward_text: string;
  qr: string;
  expired: boolean;
  active: boolean;
  replacedByName: string | null;
  carriedOverCount: number | null;
  // Points Club catalog mode only — every other mechanic gets an empty
  // array. Each entry is its own scannable voucher (voucher_token,
  // rendered here as pre-generated QR svg, same convention as the main
  // card's own `qr` field above).
  activeVouchers: {
    id: string;
    rewardText: string;
    expiresAt: string | null;
    qr: string;
  }[];
};
```

In `src/features/card-check/api/actions.ts`, extend `VendorJoinRow`:

```ts
type VendorJoinRow = {
  // ...unchanged existing fields...
  active_vouchers: unknown;
  referral_credit?: unknown;
};
```

In `checkStatusAction`'s `rows.map(async (row) => {...})`, add before the `return {...}`:

```ts
const rawVouchers = Array.isArray(row.active_vouchers)
  ? (row.active_vouchers as {
      id: string;
      voucher_token: string;
      reward_text: string;
      expires_at: string | null;
    }[])
  : [];
const activeVouchers = await Promise.all(
  rawVouchers.map(async (v) => ({
    id: v.id,
    rewardText: v.reward_text,
    expiresAt: v.expires_at,
    qr: await qrSvg(v.voucher_token),
  })),
);
```

...and add `activeVouchers,` to the returned object literal.

Add, near the end of the file (after `setCustomerBirthdayAction`):

```ts
// Customer self-service catalog pick — same anonymous, phone-scoped trust
// model as regenerateCardAction/setCustomerBirthdayAction. The RPC
// re-derives cost/label from the program's own config server-side (see
// migration 0043) — nothing here is trusted from the client beyond which
// item id was tapped.
export async function selectPointsRewardAction(
  formData: FormData,
): Promise<
  ActionResult<{ id: string; phone: string; rewardText: string; qr: string }>
> {
  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return { success: false, error: "Enter a valid Singapore phone number." };
  }
  const programId = String(formData.get("program") ?? "");
  if (!programId) {
    return { success: false, error: "Missing program." };
  }
  const itemId = String(formData.get("item_id") ?? "");
  if (!itemId) {
    return { success: false, error: "Missing reward." };
  }

  const supabase = await createServerClient();
  const { data: voucher, error } = await supabase.rpc("select_points_reward", {
    p_program: programId,
    p_phone: normalized.phone,
    p_item_id: itemId,
  });
  if (error || !voucher) {
    console.error("select_points_reward failed", error);
    const message =
      error?.message === "insufficient_points"
        ? "Not enough points for that reward yet."
        : "Something went wrong. Try again.";
    return { success: false, error: message };
  }

  const qr = await qrSvg(voucher.voucher_token);
  return {
    success: true,
    id: voucher.id,
    phone: normalized.phone,
    rewardText: voucher.reward_text,
    qr,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/features/card-check/api/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Fix the one other `CardStatus` fixture this breaks**

`src/features/card-check/components/check-form.dom.test.tsx` builds a raw `CardStatus` object (around line 51-63, inside `checkStatusActionMock.mockResolvedValue({...})`) that will now fail TS strict-object-literal checks without the new field. Add a sibling line right after its existing `carriedOverCount: null,`:

```ts
          carriedOverCount: null,
          activeVouchers: [],
```

(`program-card-status.dom.test.tsx`'s own fixtures get the same fix in Task 14, since that task adds new fixtures to the same file anyway.)

- [ ] **Step 6: Run the full check**

Run: `pnpm check`
Expected: PASS — no remaining `CardStatus` literal missing `activeVouchers`.

- [ ] **Step 7: Update READMEs**

`src/features/card-check/api/README.md`: extend `actions.ts`'s bullet — `checkStatusAction` now also builds `activeVouchers` per card from `vendor_join`'s new `active_vouchers` column, pre-rendering each voucher's own QR the same way the main card's `qr` field already works; new `selectPointsRewardAction`.
`src/features/card-check/README.md`: extend `types.ts`'s bullet (or `CardStatus`'s own description, wherever it's currently documented) with `activeVouchers`.

- [ ] **Step 7: Commit**

```bash
git add src/features/card-check/types.ts src/features/card-check/api/actions.ts src/features/card-check/api/README.md src/features/card-check/api/actions.test.ts src/features/card-check/components/check-form.dom.test.tsx
git commit -m "feat(points): checkStatusAction surfaces active vouchers, selectPointsRewardAction"
```

---

## Task 14: Customer UI — `program-card-status.tsx` + `PointsCatalogPicker`

**Files:**

- Create: `src/features/card-check/components/points-catalog-picker.tsx`
- Create: `src/features/card-check/components/points-catalog-picker.dom.test.tsx`
- Modify: `src/features/card-check/components/program-card-status.tsx`
- Test: `src/features/card-check/components/program-card-status.dom.test.tsx`

**Interfaces:**

- Consumes: `selectPointsRewardAction` (Task 13), `view.catalog`/`view.redemptionMode` (Task 3).
- Produces: `PointsCatalogPicker`; `ProgramCardStatus` renders it for catalog mode and a "Your rewards" QR list for any pending vouchers.

- [ ] **Step 1: Write the failing tests**

Create `src/features/card-check/components/points-catalog-picker.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { selectMock } = vi.hoisted(() => ({ selectMock: vi.fn() }));
vi.mock("../api/actions", () => ({ selectPointsRewardAction: selectMock }));

import { PointsCatalogPicker } from "./points-catalog-picker";

const items = [
  { id: "a", label: "Free drink", cost: 100 },
  { id: "b", label: "Free meal", cost: 300 },
];

describe("PointsCatalogPicker", () => {
  it("renders nothing when no items are affordable", () => {
    const { container } = render(
      <PointsCatalogPicker
        programId="p1"
        phone="+6591234567"
        items={[]}
        onSelected={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("confirms and reports the new voucher on success", async () => {
    selectMock.mockResolvedValue({
      success: true,
      id: "v1",
      phone: "+6591234567",
      rewardText: "Free drink",
      qr: "<svg>mock</svg>",
    });
    const onSelected = vi.fn();
    const user = userEvent.setup();
    render(
      <PointsCatalogPicker
        programId="p1"
        phone="+6591234567"
        items={items}
        onSelected={onSelected}
      />,
    );
    await user.click(screen.getByRole("button", { name: /free drink/i }));
    await user.click(screen.getByRole("button", { name: "Redeem" }));
    expect(selectMock).toHaveBeenCalled();
    expect(onSelected).toHaveBeenCalledWith({
      id: "v1",
      rewardText: "Free drink",
      qr: "<svg>mock</svg>",
    });
  });
});
```

Add to `src/features/card-check/components/program-card-status.dom.test.tsx` (add `activeVouchers: []` to every existing `CardStatus` fixture in this file first, per Task 13's Step 5 note):

```ts
it("shows the reward catalog for a points card in catalog mode", () => {
  render(
    <ProgramCardStatus
      card={{
        programId: "p1",
        name: "Coffee Points",
        label: "150 points",
        view: {
          kind: "dots",
          filled: 150,
          total: 300,
          variant: "points",
          redemptionMode: "catalog",
          catalog: [
            { id: "a", label: "Free drink", cost: 100, affordable: true },
            { id: "b", label: "Free meal", cost: 300, affordable: false },
          ],
        },
        rewardReady: true,
        reward_text: "unused",
        qr: "",
        expired: false,
        active: true,
        replacedByName: null,
        carriedOverCount: null,
        activeVouchers: [],
      }}
      phone="+6591234567"
    />,
  );
  expect(screen.getByRole("button", { name: /free drink/i })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /free meal/i }),
  ).not.toBeInTheDocument();
});

it("renders each pending voucher's own QR under Your rewards", () => {
  render(
    <ProgramCardStatus
      card={{
        programId: "p1",
        name: "Coffee Points",
        label: "50 points",
        view: {
          kind: "dots",
          filled: 50,
          total: 300,
          variant: "points",
          redemptionMode: "catalog",
          catalog: [],
        },
        rewardReady: false,
        reward_text: "unused",
        qr: "",
        expired: false,
        active: true,
        replacedByName: null,
        carriedOverCount: null,
        activeVouchers: [
          {
            id: "v1",
            rewardText: "Free drink",
            expiresAt: null,
            qr: "<svg>mock</svg>",
          },
        ],
      }}
      phone="+6591234567"
    />,
  );
  expect(screen.getByText("Your rewards")).toBeInTheDocument();
  expect(screen.getByText("Free drink")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/card-check/components/points-catalog-picker.dom.test.tsx src/features/card-check/components/program-card-status.dom.test.tsx`
Expected: FAIL — `PointsCatalogPicker` doesn't exist; `ProgramCardStatus` still just renders `PointsBar` for every points card.

- [ ] **Step 3: Implement**

Create `src/features/card-check/components/points-catalog-picker.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { selectPointsRewardAction } from "../api/actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type CatalogItem = { id: string; label: string; cost: number };
type NewVoucher = { id: string; rewardText: string; qr: string };

// Only ever passed the already-affordable subset of a program's catalog
// (program-card-status.tsx filters); renders nothing at all rather than a
// permanently-disabled list when none are affordable yet.
export function PointsCatalogPicker({
  programId,
  phone,
  items,
  onSelected,
}: {
  programId: string;
  phone: string;
  items: CatalogItem[];
  onSelected: (voucher: NewVoucher) => void;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (items.length === 0) return null;

  function confirm(item: CatalogItem) {
    setSubmitting(true);
    (async () => {
      const fd = new FormData();
      fd.set("phone", phone);
      fd.set("program", programId);
      fd.set("item_id", item.id);
      const res = await selectPointsRewardAction(fd);
      setSubmitting(false);
      setPendingId(null);
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.rewardText} redeemed — show the QR to the shop.`);
      onSelected({ id: res.id, rewardText: res.rewardText, qr: res.qr });
    })();
  }

  return (
    <div className="w-full space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Choose your reward
      </p>
      {items.map((item) => (
        <AlertDialog
          key={item.id}
          open={pendingId === item.id}
          onOpenChange={(open) => setPendingId(open ? item.id : null)}
        >
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-between rounded-xl"
            >
              <span>{item.label}</span>
              <span className="text-muted-foreground">{item.cost} pts</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Redeem {item.label}?</AlertDialogTitle>
              <AlertDialogDescription>
                Uses {item.cost} points. Any remaining points stay on your card
                — you&apos;ll get a QR to show the shop.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={submitting}
                onClick={(e) => {
                  e.preventDefault();
                  confirm(item);
                }}
              >
                {submitting ? "Redeeming…" : "Redeem"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ))}
    </div>
  );
}
```

In `src/features/card-check/components/program-card-status.tsx`, add imports:

```tsx
import { useEffect, useState, useTransition } from "react";
import { PointsCatalogPicker } from "./points-catalog-picker";
```

Add a small piece of local state, right after the existing `noticeOpen` state:

```tsx
const [freshVouchers, setFreshVouchers] = useState<
  { id: string; rewardText: string; qr: string }[]
>([]);
```

Replace the `if (view.variant === "points")` branch inside `renderView()`:

```tsx
if (view.variant === "points") {
  if (view.redemptionMode === "catalog") {
    return (
      <div className="flex w-full flex-col items-center gap-3">
        <PointsBar filled={view.filled} total={view.total} />
        <PointsCatalogPicker
          programId={card.programId}
          phone={phone}
          items={(view.catalog ?? []).filter((item) => item.affordable)}
          onSelected={(voucher) =>
            setFreshVouchers((prev) => [...prev, voucher])
          }
        />
      </div>
    );
  }
  return <PointsBar filled={view.filled} total={view.total} />;
}
```

Add the "Your rewards" list, right after the existing `{card.qr && (...)}` block:

```tsx
{
  (card.activeVouchers.length > 0 || freshVouchers.length > 0) && (
    <div className="w-full space-y-2 border-t pt-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Your rewards
      </p>
      {[...card.activeVouchers, ...freshVouchers].map((v) => (
        <div
          key={v.id}
          className="flex flex-col items-center gap-1.5 rounded-xl border p-2"
        >
          <p className="text-xs font-medium">{v.rewardText}</p>
          <div
            className="w-full max-w-[120px] rounded-lg border bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: v.qr }}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/features/card-check/components/points-catalog-picker.dom.test.tsx src/features/card-check/components/program-card-status.dom.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full check**

Run: `pnpm check && pnpm test --run && pnpm build`
Expected: all green — this is the last task, so this is also the final full-suite gate for the whole plan.

- [ ] **Step 6: Update `src/features/card-check/components/README.md`**

New `points-catalog-picker.tsx` bullet: `PointsCatalogPicker` — renders nothing when passed an empty (already-filtered-to-affordable) item list; each button opens an `AlertDialog` confirm before calling `selectPointsRewardAction`, reports the new voucher's `{id, rewardText, qr}` back to its caller. Extend `program-card-status.tsx`'s bullet: its points branch now renders `PointsCatalogPicker` (catalog mode, filtered to affordable items) below the unchanged `PointsBar`, plus a new "Your rewards" section listing every pending voucher's own QR — the card's own `activeVouchers` (from `checkStatusAction`) plus any picked this session (local `freshVouchers` state, since a freshly-created voucher isn't in `card.activeVouchers` until the next full page fetch).

- [ ] **Step 7: Commit**

```bash
git add src/features/card-check/components/points-catalog-picker.tsx src/features/card-check/components/program-card-status.tsx src/features/card-check/components/README.md src/features/card-check/components/points-catalog-picker.dom.test.tsx src/features/card-check/components/program-card-status.dom.test.tsx
git commit -m "feat(points): customer-facing reward catalog picker and pending-vouchers list"
```

---

## Explicitly out of scope (per spec)

- `PointsBar`'s own visual redesign — this plan keeps it pixel-unchanged; a follow-up design pass once this architecture is live.
- Growth/Chance/classic-Stamp — untouched, already have voucher-ledger + expiry from `0027`.
- Real payment-processing integration for offset mode — the dollar figure is informational only.
- Switching an existing program's `redemption_mode` after creation — not offered in the setup UI.
- A background job to proactively expire vouchers — reuses `0027`'s existing lazy-expire-on-touch pattern (unaffected by this plan).
