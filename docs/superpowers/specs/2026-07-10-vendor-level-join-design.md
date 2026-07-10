# Vendor-level join: one QR per vendor, not per program

Date: 2026-07-10

## Problem

loopkit's customer-facing join QR currently encodes a `program_id`
(`/c?p=<program_id>`, generated on `/dashboard/grow`). A Pro vendor running
2+ programs therefore has 2+ separate QR codes to print and manage, and a
customer scanning one only ever sees/joins that one program — even if the
same stall runs three different loyalty mechanics side by side.

qkit's equivalent (`/dashboard/booths/[boothId]/qr`) has the same
one-QR-per-sub-entity shape, but that's a better fit there: booths are
usually genuinely different physical/menu contexts. loopkit's programs are
typically just different reward mechanics run by the same single stall, so
forcing a customer to scan a different code per program is worse UX for no
real benefit.

loopkit has no live users yet, so this is a clean-break redesign, not a
migration with back-compat constraints.

## Decision

The join QR moves from program-scoped to **vendor-scoped**:
`/c?v=<vendor_id>` (the vendor's `auth.users.id` — already a stable,
unique-per-vendor identifier; `programs.vendor_id`'s uniqueness constraint
was already dropped in migration `0007_loopkit_multiprogram.sql` when
multi-program support landed, so nothing schema-side needs to change to
make `vendor_id` a valid public join key).

A customer scanning it and entering their phone is **auto-enrolled in
every one of the vendor's currently-active programs** they don't already
have a card for (confirmed: no picker step — simplest experience). They
then see all their cards at that vendor on one page, stacked.

A customer's card for a program the vendor has since deactivated (or
downgraded away from) **still appears** in that list — it just stops being
something newly joinable. Existing progress/rewards aren't hidden.

## What does NOT change

- `cards` table schema, `stamp_events`, all engine `Strategy` code
  (`src/lib/engine/*`) — a "card" stays one row per `(program_id, phone)`;
  the different program types' progress shapes (stamp count vs. plant
  growth JSON vs. streak JSON) are genuinely different and stay genuinely
  separate. Nothing here needed a "vendor-level card" data model — the
  fix belongs at the identity/enrollment/QR layer, not the schema.
- `enroll_card`, `record_visit`, `redeem`, `regenerate_card` RPCs — reused
  as-is; `enroll_card`'s existing seeding/head-start logic is called
  internally by the new fan-out, not duplicated.
- The vendor dashboard's Counter/Customers/Activity/Stats pages — still
  program-scoped via the existing `?p=` switcher. The vendor still serves
  ("stamp this card") one program at a time; that's a different concern
  from how a _customer_ joins.
- The per-card `card_token` QR (shown to a customer after check-in, scanned
  by the vendor at the counter for a repeat visit) — stays program-specific,
  unchanged. It's a different QR for a different purpose than the join QR.

## What changes

### A. New migration — `supabase/migrations/0015_loopkit_vendor_join.sql`

Two new public (`SECURITY DEFINER`) functions, following this codebase's
existing public-RPC trust model (phone-format-validated, no `owns_program`
check — same as `enroll_card`/`regenerate_card` today):

```sql
-- Public: list a vendor's currently-active programs (name/type/reward only
-- — enough for the /c landing page to preview what a scan joins, before
-- the customer has typed a phone number). Supersedes the old
-- card_view-called-with-an-empty-phone hack used for the same purpose.
create or replace function loopkit.vendor_active_programs(p_vendor uuid)
returns table (id uuid, name text, type text, reward_text text)
language sql security definer stable set search_path = '' as $$
  select id, name, type, reward_text
  from loopkit.programs
  where vendor_id = p_vendor and active
  order by created_at asc;
$$;

grant execute on function loopkit.vendor_active_programs(uuid) to anon, authenticated, service_role;

-- Public: the /c?v=<vendor> entry point. Enrolls the phone into every one
-- of the vendor's active programs it doesn't already have a card for
-- (delegating to enroll_card so seeding/head-start logic lives in exactly
-- one place), then returns every card the phone holds at this vendor —
-- including cards for programs that have since gone inactive, so a
-- customer doesn't lose sight of progress on a program the vendor paused.
create or replace function loopkit.vendor_join(p_vendor uuid, p_phone text)
returns table (
  program_id uuid, name text, type text, config jsonb, state jsonb,
  stamp_count int, card_token text, reward_text text, stamps_required int,
  expiry_days int, cycle_started_at timestamptz, active boolean
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
           p.stamps_required, p.expiry_days, c.cycle_started_at, p.active
    from loopkit.cards c
    join loopkit.programs p on p.id = c.program_id
    where p.vendor_id = p_vendor and c.phone = p_phone
    order by c.created_at asc;
end;
$$;

grant execute on function loopkit.vendor_join(uuid, text) to anon, authenticated, service_role;
```

If `p_vendor` has zero active programs (bad id, or every program paused),
`vendor_join` simply enrolls into nothing and returns whatever cards
already exist (possibly none) — no exception. The page renders an
appropriate empty state rather than an error.

`src/lib/types.ts` gets two new `Functions` entries mirroring these
signatures (hand-mirrored, per this repo's existing no-live-codegen
convention).

### B. `src/app/c/page.tsx` — read `v`, not `p`

```tsx
type CheckPageProps = {
  searchParams: Promise<{ v?: string }>;
};

export default async function CheckPage({ searchParams }: CheckPageProps) {
  const { v } = await searchParams;

  let programs: {
    id: string;
    name: string;
    type: string;
    reward_text: string;
  }[] = [];
  if (v) {
    const supabase = await createServerClient();
    const { data } = await supabase.rpc("vendor_active_programs", {
      p_vendor: v,
    });
    programs = data ?? [];
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark className="text-3xl" />
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">
            Loyalty card
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {programs.length > 0
              ? `Join: ${programs.map((p) => p.name).join(", ")}`
              : "Check your rewards."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            New here? Enter your phone to join — no app needed.
          </p>
        </div>

        <div className="rounded-2xl border bg-card px-7 py-9 shadow-sm">
          {v ? (
            <CheckForm vendorId={v} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Ask the shop for their loyalty link.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
```

(No per-program "shop name" header is available at the vendor level — there
is no vendor-level display-name field in the schema today, and adding one
is out of scope for this fix. The join-preview line ("Join: X, Y") gives
the customer the same context the old per-program header did, without
inventing a new entity.)

### C. `src/app/c/status-state.ts` — single card → list of cards

```typescript
import type { ProgressView } from "@/lib/engine/types";

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
};

export type StatusState = {
  status: "idle" | "found" | "none" | "error";
  cards?: CardStatus[];
  message?: string;
  phone?: string;
};

export const STATUS_IDLE: StatusState = { status: "idle" };
```

`status: "found"` now means "at least one card exists" (`cards.length > 0`);
`"none"` means the vendor has no active programs AND the phone has no
existing cards there (both fan-out and lookup came back empty).

### D. `src/app/c/actions.ts` — one RPC call replaces enroll+read

```typescript
export async function checkStatusAction(
  _prev: StatusState,
  formData: FormData,
): Promise<StatusState> {
  if (!(await allowRequest("c-check"))) {
    return {
      status: "error",
      message: "Too many attempts — try again in a minute.",
    };
  }

  const normalized = normalizePhone(String(formData.get("phone") ?? ""));
  if (!normalized.ok) {
    return {
      status: "error",
      message: "Enter a valid Singapore phone number.",
    };
  }

  const vendorId = String(formData.get("vendor") ?? "");
  if (!vendorId) {
    return { status: "error", message: "Missing shop." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("vendor_join", {
    p_vendor: vendorId,
    p_phone: normalized.phone,
  });
  if (error) {
    console.error("vendor_join failed", error);
    return { status: "error", message: "Something went wrong." };
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return { status: "none", message: "We couldn't find any rewards here." };
  }

  const cards: CardStatus[] = await Promise.all(
    rows.map(async (row) => {
      const programLike = {
        type: row.type,
        config: row.config,
        stamps_required: row.stamps_required,
        reward_text: row.reward_text,
      };
      const cardLike = {
        state: row.state,
        stamp_count: row.stamp_count ?? 0,
        reward_count: 0,
      };
      const progress = getProgress(programLike, cardLike, new Date());
      const qr = await qrSvg(row.card_token);
      const expired =
        row.cycle_started_at != null &&
        isCardExpired(row.cycle_started_at, row.expiry_days, new Date());
      return {
        programId: row.program_id,
        name: row.name,
        label: progress.label,
        view: progress.view,
        rewardReady: progress.rewardReady,
        reward_text: row.reward_text,
        qr,
        expired,
        active: row.active,
      };
    }),
  );

  return { status: "found", cards, phone: normalized.phone };
}
```

`regenerateCardAction` is unchanged in signature/body (still takes a single
`program` + `phone`) — it's invoked once per selected card from the new
list UI, not once for the whole page.

### E. `src/app/c/check-form.tsx` — form + card list container

`CheckForm` takes `vendorId` instead of `programId`, renders the phone
form, and maps `state.cards` into a new subcomponent (below) instead of
inlining a single card's view. The hidden field becomes
`<input type="hidden" name="vendor" value={vendorId} />`.

### F. `src/app/c/program-card-status.tsx` (new)

Extracts the per-card rendering (the plant/streak/chance/dots view switch,
label, reward-ready/expired banners, QR, and its own regenerate
`AlertDialog` + `useTransition`) out of `check-form.tsx` into a
self-contained component: `<ProgramCardStatus card={c} phone={phone} />`.
Each card manages its own dialog-open state independently — necessary now
that there can be several cards on one page. Content is the same JSX
`check-form.tsx` has today, just parameterized per-card instead of reading
directly from `state`. An inactive card (`card.active === false`) gets a
small "no longer joinable — but you can still redeem this" note.

### G. `src/app/dashboard/grow/page.tsx` — vendor-level, no `?p=`

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireVendor } from "@/lib/auth";
import { listPrograms } from "@/lib/program";
import { qrSvg } from "@/lib/qr";
import { CardLinkActions } from "@/app/dashboard/card-link";

export default async function GrowPage() {
  const { user } = await requireVendor();

  const programs = await listPrograms();
  const active = programs.filter((p) => p.active);
  if (programs.length === 0) redirect("/setup");

  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_BASE_URL ??
    `https://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const cardLink = `${origin}/c?v=${user.id}`;
  const cardQr = await qrSvg(cardLink);

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-5 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Get customers to join
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One QR for your whole shop — new customers scan it once and join{" "}
          {active.length > 0
            ? active.map((p) => p.name).join(", ")
            : "your programs"}{" "}
          automatically. Returning customers use the same link to check their
          cards.
        </p>
      </div>

      {active.length === 0 && (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          None of your programs are active right now — new scans won&apos;t join
          anything until you activate one.
        </p>
      )}

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div
            className="shrink-0 rounded-xl border bg-white p-2 [&_svg]:size-32"
            dangerouslySetInnerHTML={{ __html: cardQr }}
          />
          <div className="min-w-0 space-y-3">
            <code className="block truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              {cardLink}
            </code>
            <CardLinkActions link={cardLink} />
          </div>
        </div>
      </div>
    </main>
  );
}
```

Dropping the program switcher/`?p=` here also means `dashboard-nav.tsx`'s
`LINKS` array needs a per-entry flag so the render loop knows which links
stay program-scoped and which don't — only Grow changes:

```typescript
const LINKS = [
  { href: "/dashboard", label: "Counter", scoped: true },
  { href: "/dashboard/customers", label: "Customers", scoped: true },
  { href: "/dashboard/activity", label: "Activity", scoped: true },
  { href: "/dashboard/stats", label: "Stats", scoped: true },
  { href: "/dashboard/grow", label: "Grow", scoped: false },
  { href: "/dashboard/plan", label: "Plan", scoped: true },
];
```

Both render loops (desktop `nav` and the mobile inline list) change their
`href={withProgram(link.href)}` to `href={link.scoped ? withProgram(link.href) : link.href}`.

### H. `src/app/dashboard/card-link.tsx`

Unchanged — it's already link-string-agnostic.

## Testing

- `test/db/vendor-join-schema.test.ts` (new) — regex-match the new
  migration's SQL text (this repo's established pattern for un-runnable-
  live-DB schema tests): asserts both function signatures exist, the phone
  regex guard is present in `vendor_join`, and the `not exists (...)`
  dedup-against-existing-cards clause is present.
- `test/app/check-status-action.test.ts` — fully rewritten (the RPC surface
  it mocks changes completely, from `enroll_card`+`card_view` to a single
  `vendor_join` call): missing-vendor / invalid-phone rejection without an
  RPC call, a single-card result, a multi-card result, an inactive card
  still appearing in the result, empty-rows → `status: "none"`, and an RPC
  error → `status: "error"`.
- `test/db/enroll-phone-guard-schema.test.ts` — unchanged, still valid
  (`enroll_card` itself isn't modified).
- Any test fixture asserting the old `StatusState` shape (single
  `view`/`label`/`programId` at the top level) needs updating to the new
  `cards: CardStatus[]` shape — scan for callers when implementing.

## Out of scope

- No vendor-level "shop name"/display-name field — the join page uses a
  program-name-list preview instead of inventing a new profile entity.
- No change to how the vendor _serves_ a customer (Counter page) — still
  program-scoped, vendor picks which program they're stamping via the
  existing nav switcher.
- No retroactive migration of old `/c?p=` links — there are no live users,
  so the old param is dropped outright, not kept as a redirect/alias.
