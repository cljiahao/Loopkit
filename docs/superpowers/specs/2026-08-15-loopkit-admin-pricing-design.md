# loopkit Admin-Tunable Pricing — Design

## Problem statement

loopkit's Pro tier has never had a real price. `/dashboard/plan` today
shows no dollar figure at all — a vendor who isn't on Pro sees only:

> "Run more than one loyalty program at a time. Message us and we'll set
> you up — no card needed yet."

An earlier cross-kit pricing doc (`2026-07-30-cross-kit-pricing-and-
billing-plan.md`) aspired to **$9/mo** for loopkit, but that number was
never wired into any code path — no schema field, no display, no admin
control. This design gives loopkit its first real, live price: **$4.99/mo**,
admin-tunable from `/admin` with no redeploy, using the same
single-row-`pricing`-table + service-role-`setPricing`-action pattern
already live in qkit (`src/lib/pricing.ts`, `src/app/admin/pricing-form.tsx`,
`src/app/admin/actions.ts`'s `setPricing`, `supabase/migrations/
0010_monetization.sql`).

## Why this is a launch, not a price change

Every other kit that has touched pricing this session (paykit's $4→$4.99
correction, stockkit's $14→$19.99 raise, qkit's hold) was **adjusting an
already-live number**. loopkit is the only kit in the family with no live
price at all today — the $9 in the old cross-kit doc was a planning
aspiration that was never shipped to a database column, an admin control,
or a vendor-facing page. That changes the framing:

- There is no existing paying vendor to protect from a price move. The
  manual "ask us" grant flow (`upgrade_requests` table,
  `requestUpgrade`/`UpgradeCta`) has never charged anyone a dollar figure
  because no dollar figure has ever been shown.
- The number that ships is the number that defines the market's first
  impression of loopkit Pro — get the launch anchor right, not "correct a
  mistake."
- Nothing needs a migration-safe transition for existing Pro vendors'
  billing state, because no billing state referencing a price exists yet
  (`vendor_pro` is presence-only — a boolean-shaped join table, no price
  column).

This is why the price seeds directly at **$4.99/mo (499 cents)** in the
migration itself, not at `0` the way qkit's original `0010_monetization.sql`
seeded (qkit's `DEFAULT_PRICING` fallback of `0` exists purely as a
DB-read-failure safety net — see "Fallback semantics" below — not as
loopkit's real launch value).

## $4.99/mo rationale

Full reasoning lives in `Merqo Business/docs/business/2026-08-15-per-kit-
pricing-rationale.md` (loopkit section) — summarized here, not re-derived:

- **loopkit's real gate is the thinnest in the family.** `src/lib/
program.ts`'s `FREE`/`PRO` entitlements gate exactly one axis — program
  count (`maxActivePrograms`: 1 free, unlimited Pro; `maxLiveInPlayPrograms`:
  2 free, unlimited Pro). Templates, card-type-change, and the stats
  dashboard are already Free for everyone (`PlanPage`'s own `FEATURES`
  list confirms this: `templates`, `Change card type`, `Stats dashboard`
  all read `free: true`). There's no multi-feature ladder to price against
  the way qkit's Free→Pass→Pro progression has.
- **The loyalty-app market is bimodal, not a continuum.** Genuinely free
  tools exist at one end (FaveCard, Stampet — permanently free or
  no-card-required free plans); full wallet-native platforms sit at the
  other ($30-107/mo — STAMPEDE, Flex Rewards, Rewardly, Stamp Me — push
  notifications, referrals, WhatsApp automation, AI reports, none of which
  loopkit has). **Nothing was found pricing in the old $9-15 range** the
  cross-kit doc assumed — that number sat in a gap the real market doesn't
  occupy: too expensive to beat the free apps on price, nowhere near
  feature-rich enough to approach the $30+ platforms.
- **loopkit's gate matches the general SaaS non-core-add-on convention,
  independently priced at $3-5/mo** (same-session research: SSO-per-user
  add-ons, time-tracking/bank-connection add-ons bundled into all-in-one
  small-business platforms). $4.99 sits inside that band.
- **Charm pricing, family-wide convention.** qkit's own live price
  ($24.99/mo) already established `.99` endings as the family's real
  convention (not round numbers, which the rationale doc reserves for
  larger, quality-signaling price points aimed at a bigger-business
  segment than Merqo's target vendor). $4.99 also matches paykit's
  corrected price, giving the family's two thin-gate utility kits the same
  number.

## Locked decisions

### 1. Schema: `loopkit.pricing` (single-row, single field)

Mirrors qkit's `pricing` table shape exactly, minus the `event_pass_cents`
column — loopkit has no day-pass concept (the cross-kit pricing doc's own
decision: day-pricing stays qkit-only, since qkit is the only kit with a
real-world "event" entity to price a day against).

```sql
create table loopkit.pricing (
  id            int primary key default 1 check (id = 1),
  monthly_cents int not null default 0,
  currency      text not null default 'SGD',
  updated_at    timestamptz not null default now()
);

insert into loopkit.pricing (id, monthly_cents) values (1, 499)
  on conflict (id) do nothing;
```

- `id` pinned to `1` via `CHECK` — same singleton pattern as qkit's
  `pricing` and loopkit's own future-singleton conventions (mirrors
  `admin_audit`'s membership-table pattern for constraint style, though
  `admin_audit` itself isn't a singleton).
- Seeded at **499** (not `0`) — this is loopkit's real launch price,
  written by the migration itself, not left for an admin to set
  post-deploy. An admin may still retune it from `/admin` immediately
  after — that's the whole point of the pattern — but the kit never goes
  live with an unset price the way a `0`-seeded row would imply.
- RLS: public `SELECT` (prices aren't secret; the plan page is behind
  auth but a public read keeps the policy simple and leaks nothing), no
  `INSERT`/`UPDATE`/`DELETE` policy — writes go through the service-role
  `setPricing` action only, same as qkit.
- Table name intentionally **not** prefixed `loopkit_` — every other table
  in this schema (`programs`, `cards`, `admin_audit`, `feedback`, etc.)
  is unprefixed; the schema itself (`loopkit`) is the namespace.

### 2. `src/lib/pricing.ts` — `PricingConfig` + `DEFAULT_PRICING`

```ts
import type { Pricing } from "@/lib/types";

export type PricingConfig = Pick<Pricing, "monthly_cents" | "currency">;

export const DEFAULT_PRICING: PricingConfig = {
  monthly_cents: 0,
  currency: "SGD",
};
```

**Fallback semantics (unchanged from qkit's contract):** `DEFAULT_PRICING`
is a DB-read-failure safety net, not loopkit's real price — it exists so
`/dashboard/plan` degrades to "no price shown" instead of throwing if the
`pricing` row is ever unreadable (e.g. a bad migration order in a fresh
environment), not because loopkit's steady-state price is ever meant to be
`$0`. In steady state the DB row (seeded 499, admin-tunable thereafter) is
what every page reads.

### 3. `setPricing` server action

Same shape as qkit's `setPricing` (`src/app/admin/actions.ts`): Zod-
validate, service-role write pinned to `id = 1`, best-effort `admin_audit`
row, `revalidatePath` on every page that reads the price.

```ts
export const pricingFormSchema = z.object({
  monthly_cents: z.number().int().nonnegative().max(MAX_MONEY_CENTS),
});
export type PricingFormInput = z.infer<typeof pricingFormSchema>;
```

`MAX_MONEY_CENTS` reuses qkit's own sentinel ceiling (`10_000_00` = $10,000)
— a generous but real cap, not an unbounded `number`, so a forged/garbled
form payload can't write an absurd price.

```ts
export async function setPricing(
  input: PricingFormInput,
): Promise<ActionResult> {
  const { user } = await requireAdmin();
  const parsed = pricingFormSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid input" };

  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("pricing")
    .update({
      monthly_cents: parsed.data.monthly_cents,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    console.error("setPricing failed", error.message);
    return { success: false, error: "Could not update pricing" };
  }

  await recordAudit(user.id, "set_pricing", null, {
    monthly_cents: parsed.data.monthly_cents,
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard/plan");
  return { success: true };
}
```

`recordAudit` is loopkit's existing helper (`src/app/admin/actions.ts`,
already used by `setProgramActive`/`setVendorPro`/`removeCard`/
`resolveUpgradeRequest`) — `setPricing` slots in as a fifth action in that
same file, not a new file, following the file's existing one-file-per-
admin-domain convention (loopkit's `admin/actions.ts` is smaller than
qkit's and has no per-concern split yet).

Admin-only enforcement: `requireAdmin()` 404s a non-admin before any read
or write happens, identical to every other action in this file.

### 4. Admin UI: `@merqo/ui`'s `PricingForm`

loopkit adopts the **new**, not-yet-superseded, generalized `PricingForm`
from `@merqo/ui` (`Merqo Business/merqo-ui/docs/superpowers/plans/
2026-08-15-pricing-form.md`) rather than porting qkit's old bespoke
`pricing-form.tsx` — qkit's version is 2-field (event pass + monthly) and
is itself slated to migrate onto this same shared component in a later,
separate plan (out of scope for both that plan and this one). loopkit only
ever needs **one field**:

```tsx
<PricingForm
  fields={[{ key: "monthly_cents", label: "Monthly (SGD)" }]}
  initial={{
    values: { monthly_cents: pricing.monthly_cents },
    currency: pricing.currency,
  }}
  onSave={async (values) => {
    "use server"; // illustrative — real wiring goes through a client wrapper, see plan
  }}
  helpText="Shown on the vendor plan page."
/>
```

In practice this needs a small client wrapper (loopkit has no precedent
for calling a server action directly as a prop from a Server Component
into a Client Component's `onSave` — the actual plan wires `onSave` to
call `setPricing` via a thin client component, and `onError` to `toast.error`
via `sonner`, matching the toast convention already used by
`vendor-pro-toggle.tsx` and `upgrade-cta.tsx` in this same admin surface).
No `toast` import inside `PricingForm` itself — per its own contract,
success/failure surfaces via `onSave` resolving / `onError` firing, and the
consuming wrapper owns the toast call, exactly like every other admin
control loopkit already has (`VendorProToggle`, `ResolveUpgradeRequestButton`).

**Where it lives:** loopkit's `/admin` has three tabs (Overview, Programs,
Vendors — `AdminNav`) and no existing Pricing/Billing tab. Mirroring
qkit's placement (a `<section>` on the main admin page, not a separate
route), the `PricingForm` slots onto `/admin` (`AdminOverviewPage`,
`src/app/admin/page.tsx`) as a new section below the existing recent-
activity section — no new admin route, no new nav tab. The page's data
fetch gains one query: `pricing` row select, same shape as `platformTotals`/
`recentActivity`'s existing `Promise.all`.

### 5. Plan page: from "no price shown" to a live DB-read price

**Current copy** (`src/app/dashboard/plan/page.tsx`, non-Pro branch):

> "Run more than one loyalty program at a time. Message us and we'll set
> you up — no card needed yet."

**New copy:** the Pro card gains a live price line above the description,
sourced from the `pricing` row (same `paidMode`-style conditional qkit's
plan page uses: show the real price when `monthly_cents > 0`, degrade to
generic copy if the row is ever unreadable). Example shape (final copy is
the plan's to write, this fixes the _mechanism_, not the exact words):

```tsx
<p className="mt-1 font-mono text-2xl font-bold">
  {monthlyPrice ?? "Soon"}
  {monthlyPrice && <span className="ml-1 text-sm font-normal text-muted-foreground">/ month</span>}
</p>
<p className="mt-2 text-sm text-muted-foreground">
  Run more than one loyalty program at a time.
</p>
```

with the "Message us and we'll set you up — no card needed yet" sentence
either kept as a trailing line under the CTA (explaining _how_ to actually
get Pro today, since the grant mechanism is unchanged — see below) or
folded into the `UpgradeCta` button's own label — the plan decides the
exact placement; the requirement is that a real `$4.99 / month` figure is
visible, not that this specific sentence is deleted outright.

### 6. What stays unchanged: the manual grant flow, no real billing

`requestUpgrade` (`src/app/dashboard/plan/actions.ts`) and `UpgradeCta`
(`src/app/dashboard/plan/upgrade-cta.tsx`) are **not** touched by this
design. Per the task's own framing and the cross-kit pricing doc's Phase-3
sequencing (real Stripe billing is still gated behind that later phase
across the whole family — not just loopkit), showing a real price is a
**display and expectation-setting change**, not a checkout change. A
vendor still clicks "Request upgrade," files an `upgrade_requests` row,
and an admin still grants Pro manually via `setVendorPro`/
`resolveUpgradeRequest` — those two existing actions are untouched by this
plan. The only thing that changes for the vendor is that they now see
"$4.99/month" instead of no number at all before clicking Request upgrade.

This mirrors qkit's own current state: qkit shows real prices on its plan
page today but still fulfils upgrades manually via PayNow/cash + an admin
action, not a live Stripe charge (`grantPass`/`setVendorPlan` in qkit's
`admin/actions.ts` still take a manual `amountCents`/`note`, not a payment-
provider webhook). loopkit's manual flow doesn't even carry an amount
field — `requestUpgrade` takes no arguments — and this design does not add
one; the price is informational context for the vendor, not a checkout
parameter, until Phase 3 billing exists.

## Data model

New table only — `loopkit.pricing` (above). No change to `vendor_pro`,
`upgrade_requests`, `admins`, or `admin_audit` (the audit row's `action`
column already accepts arbitrary text; `"set_pricing"` is a new value, not
a new column).

## Interfaces touched

- `src/lib/pricing.ts` — **new file**: `PricingConfig`, `DEFAULT_PRICING`.
- `src/lib/schemas.ts` — add `pricingFormSchema`, `PricingFormInput`,
  `MAX_MONEY_CENTS` (loopkit doesn't have this constant yet — qkit's
  `schemas.ts` does; add it here rather than importing cross-kit, per the
  "no cross-kit direct imports, only own schema + HTTP" rule in AGENTS.md).
- `src/app/admin/actions.ts` — add `setPricing`.
- `src/app/admin/page.tsx` — fetch the `pricing` row, render the new
  Pricing section.
- `src/app/admin/pricing-form-client.tsx` (or similar name — the plan
  picks the final filename) — **new file**: thin client wrapper around
  `@merqo/ui`'s `PricingForm`, wiring `onSave` → `setPricing` and
  `onError`/toast, matching `VendorProToggle`'s existing wrapper pattern.
- `src/app/dashboard/plan/page.tsx` — read the `pricing` row, replace the
  no-price copy with a live price display.
- `package.json` — bump `@merqo/ui` from `github:cljiahao/merqo-ui#v0.11.1`
  to whatever tag ships the new `PricingForm` export (the merqo-ui plan
  targets `v0.12.0` — confirm the actual published tag before bumping;
  this is a cross-repo dependency this plan cannot land ahead of).
- `supabase/migrations/0034_loopkit_pricing.sql` — **new file**: the table
  above.
- `src/lib/types.ts` — regenerate/hand-add the `pricing` table's row type
  under the `loopkit` schema key.

## Out of scope

- Real Stripe/payment-gateway billing (Phase 3, cross-kit, not started for
  any kit).
- Any change to `requestUpgrade`, `UpgradeCta`, `setVendorPro`,
  `resolveUpgradeRequest`, or the `upgrade_requests` table.
- A day-pass/event-pass concept for loopkit (deliberately qkit-only, per
  the cross-kit pricing doc).
- qkit's own migration onto the new shared `PricingForm` component (a
  separate, already-noted-out-of-scope follow-up in the merqo-ui plan).
- Landing-page marketing copy changes beyond confirming there's nothing to
  fix — `src/components/landing/benefits.tsx`'s "priced for one counter"
  line is generic positioning copy, not a dollar figure, and needs no edit.

## Risks / open questions

- **Cross-repo dependency ordering.** This plan cannot ship until
  `@merqo/ui`'s `PricingForm` is actually published (the merqo-ui plan is
  "being built in parallel," per this task's own framing) — the
  implementation plan's first real task after the migration should treat
  the `package.json` bump as a hard blocking step with a verification
  check (`PricingForm` actually exported from the installed package),
  not an assumption.
- **Stale cross-kit doc.** `Merqo Business/docs/business/2026-07-30-
cross-kit-pricing-and-billing-plan.md` still lists loopkit at "$9/mo
  (unchanged)" and uses $9 in its bundle-discount math (line 91, line 102).
  This design doesn't fix that doc (out of this repo's tree), but the
  implementation plan includes a task to correct it, following the same
  precedent paykit's own pricing-simplification plan set this session.
- **Copy ownership.** The exact final wording of the plan-page paragraph
  (keep/cut/reword "Message us... no card needed yet") is left to the
  implementation plan's judgment, not locked here — the one hard
  requirement is a real, DB-sourced `$4.99/mo` (or whatever the admin has
  since retuned it to) rendered where today there is no price at all.

## Parent

[docs/superpowers/specs](README.md)
