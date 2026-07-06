# loopkit Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship loopkit v1 — a standalone, phone-based digital stamp-card loyalty app for SG vendors, in the Merqo kit ecosystem.

**Architecture:** Next.js 16 App Router on Supabase (`@supabase/ssr`, schema `loopkit`). Vendors sign in, run one "buy N get 1 free" program, stamp customers by phone. Stamp/redeem/lookup go through SECURITY DEFINER Postgres functions (atomic + RLS-safe). A bearer-guarded `/api/merqo/metrics` endpoint reports to merqo. qkit (`Coding/qkit`) is the reference implementation — port its infra patterns; write loopkit's domain logic fresh with TDD.

**Tech Stack:** Next.js 16 · TypeScript strict · Tailwind v4 · shadcn/ui (new-york) · Zod · `@supabase/ssr` · Vitest · Playwright · pnpm 11 · Node ≥24 · Vercel. templateCentral nextjs@5.8 Supabase-variant harness.

## Global Constraints

- TypeScript strict — no `any`, no `@ts-ignore`.
- Next 16: `cookies()`/`headers()`/`params`/`searchParams` are async; route protection in `src/proxy.ts` (not `middleware.ts`).
- Supabase clients default to the `loopkit` schema (`db: { schema: "loopkit" }`). The `loopkit` schema MUST be added to the project's exposed API schemas.
- Authorization is RLS + SECURITY DEFINER functions. Use the service-role client ONLY in Server Actions / Route Handlers, never client components.
- No secrets in `NEXT_PUBLIC_*`. `MERQO_METRICS_SECRET` is server-only.
- Phone identity: normalize to `+65XXXXXXXX` (8-digit SG local, optional `+65`/`65`/spaces/dashes stripped). Reject anything else.
- pnpm 11 pinned in `packageManager`. Package manager: pnpm only.
- Every task ends green on `pnpm check` (`prettier --check` + `eslint` + `tsc --noEmit`) and `pnpm test`.
- Comment hygiene (tc 5.8): explain why-not-what; no commented-out code; no change-narration.

---

### Task 1: Scaffold + harness + repo

**Files:**

- Create: the whole `Coding/loopkit` Next.js project (via scaffold).
- Create: `.git` (new repo), `README.md`.
- Keep: the pre-written `docs/superpowers/specs/2026-07-07-loopkit-core-design.md` + this plan.

**Steps:**

- [ ] **Step 1: Scaffold via templateCentral.** From `Coding/loopkit`, invoke `templatecentral:scaffold` for a **Next.js** app named `loopkit`. Accept its Next 16 + Tailwind v4 + shadcn + Vitest + harness output (CI, husky/lint-staged or lefthook per the plugin, `.claude/`, AGENTS.md, `packageManager: pnpm@11.10.0`). Do NOT run its `add (auth)`/`add (database)` — loopkit uses Supabase, not better-auth/Drizzle (mirror qkit's AGENTS.md divergence note).

- [ ] **Step 2: Add Supabase deps.** `pnpm add @supabase/ssr @supabase/supabase-js zod` and shadcn deps if not present (`class-variance-authority clsx tailwind-merge lucide-react radix-ui`).

- [ ] **Step 3: `.env.example`.** Create with the keys loopkit reads (no values):

```
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
MERQO_METRICS_SECRET=
```

- [ ] **Step 4: Verify + commit.** `pnpm install`, `pnpm check`, `pnpm build`. Then:

```bash
git init && git add -A && git commit -m "chore: scaffold loopkit (templateCentral nextjs, Supabase variant)"
gh repo create cljiahao/loopkit --private --source=. --remote=origin --push
```

Expected: build green; repo pushed.

---

### Task 2: Supabase clients + proxy guard (port from qkit)

**Files:**

- Create: `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts` (or `proxy-helper`), `src/proxy.ts`.
- Reference: `../qkit/src/lib/supabase/*`, `../qkit/src/proxy.ts`.

**Interfaces:**

- Produces: `createClient()` (browser), `createServerClient()` (cookie, schema `loopkit`), `createServiceClient()` (secret key, schema `loopkit`), `updateSession(req)` (proxy helper).

- [ ] **Step 1: Port the three clients** from qkit `src/lib/supabase/{client,server,middleware}.ts`, changing `db: { schema: "public" }`/default to `db: { schema: "loopkit" }` in `createServerClient` + `createServiceClient` (browser client stays schema-default; it only does auth). Keep the service-client cookie-less RLS-bypass comment.

- [ ] **Step 2: Port `src/proxy.ts`** from qkit; change the protected-path predicate to guard `/dashboard` and `/setup` (redirect to `/login`). Everything else public.

- [ ] **Step 3: Verify.** `pnpm check`. Commit `feat: supabase clients + proxy guard (schema=loopkit)`.

---

### Task 3: Phone normalization (TDD, pure)

**Files:**

- Create: `src/lib/phone.ts`, `test/lib/phone.test.ts`.

**Interfaces:**

- Produces: `normalizePhone(raw: string): { ok: true; phone: string } | { ok: false }` — returns `+65XXXXXXXX` for a valid SG 8-digit local number (first digit 3/6/8/9), else `{ok:false}`.

- [ ] **Step 1: Failing test** `test/lib/phone.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it.each([
    ["91234567", "+6591234567"],
    ["+65 9123 4567", "+6591234567"],
    ["6591234567", "+6591234567"],
    ["8123-4567", "+6581234567"],
  ])("normalizes %s", (raw, out) => {
    expect(normalizePhone(raw)).toEqual({ ok: true, phone: out });
  });
  it.each(["123", "0123456789", "12345678", "abc", ""])("rejects %s", (raw) =>
    expect(normalizePhone(raw)).toEqual({ ok: false }),
  );
});
```

- [ ] **Step 2: Run — fails** (`normalizePhone` not defined).

- [ ] **Step 3: Implement** `src/lib/phone.ts`:

```ts
/** SG mobile/local numbers start 3/6/8/9 and are 8 digits. Returns E.164 +65…. */
export function normalizePhone(
  raw: string,
): { ok: true; phone: string } | { ok: false } {
  const digits = raw.replace(/[^\d]/g, "");
  const local =
    digits.startsWith("65") && digits.length === 10 ? digits.slice(2) : digits;
  if (!/^[3689]\d{7}$/.test(local)) return { ok: false };
  return { ok: true, phone: `+65${local}` };
}
```

- [ ] **Step 4: Run — passes.** Commit `feat: SG phone normalization`.

---

### Task 4: Database migration — loopkit schema + RLS + functions

**Files:**

- Create: `supabase/migrations/0001_loopkit_core.sql`.
- Create: `test/db/schema.test.ts` (asserts the migration SQL contains the required objects — a cheap guard, mirrors qkit's schema test).

**Interfaces:**

- Produces (Postgres): tables `loopkit.programs`, `loopkit.cards`, `loopkit.stamp_events`; functions `loopkit.owns_program(uuid) → bool`, `loopkit.add_stamp(uuid, text) → cards`, `loopkit.redeem(uuid) → cards`, `loopkit.card_status(uuid, text) → record`.

- [ ] **Step 1: Write the migration** `supabase/migrations/0001_loopkit_core.sql`:

```sql
create schema if not exists loopkit;

create table loopkit.programs (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null unique references auth.users(id) on delete cascade,
  name            text not null,
  stamps_required int  not null check (stamps_required between 2 and 20),
  reward_text     text not null,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create table loopkit.cards (
  id           uuid primary key default gen_random_uuid(),
  program_id   uuid not null references loopkit.programs(id) on delete cascade,
  phone        text not null,
  stamp_count  int  not null default 0,
  reward_count int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (program_id, phone)
);
create index cards_program_idx on loopkit.cards (program_id);

create table loopkit.stamp_events (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references loopkit.cards(id) on delete cascade,
  kind       text not null check (kind in ('stamp','redeem')),
  created_at timestamptz not null default now()
);
create index stamp_events_card_idx on loopkit.stamp_events (card_id);

-- ownership predicate (SECURITY DEFINER; pinned search_path)
create or replace function loopkit.owns_program(p_program uuid)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from loopkit.programs
    where id = p_program and vendor_id = (select auth.uid())
  );
$$;

-- add a stamp: upsert the card, ++count, log event. Vendor-owned only.
create or replace function loopkit.add_stamp(p_program uuid, p_phone text)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare v_card loopkit.cards;
begin
  if not loopkit.owns_program(p_program) then
    raise exception 'not authorized';
  end if;
  insert into loopkit.cards (program_id, phone, stamp_count)
    values (p_program, p_phone, 1)
  on conflict (program_id, phone)
    do update set stamp_count = loopkit.cards.stamp_count + 1, updated_at = now()
  returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'stamp');
  return v_card;
end;
$$;

-- redeem: reset stamps, ++reward_count, log. Vendor-owned only.
create or replace function loopkit.redeem(p_card uuid)
returns loopkit.cards language plpgsql security definer set search_path = '' as $$
declare v_card loopkit.cards;
begin
  select * into v_card from loopkit.cards where id = p_card;
  if v_card.id is null or not loopkit.owns_program(v_card.program_id) then
    raise exception 'not authorized';
  end if;
  update loopkit.cards
    set stamp_count = 0, reward_count = reward_count + 1, updated_at = now()
    where id = p_card returning * into v_card;
  insert into loopkit.stamp_events (card_id, kind) values (v_card.id, 'redeem');
  return v_card;
end;
$$;

-- public card status by phone (no PII/table exposure). Returns one row or none.
create or replace function loopkit.card_status(p_program uuid, p_phone text)
returns table (stamp_count int, stamps_required int, reward_text text)
language sql security definer stable set search_path = '' as $$
  select coalesce(c.stamp_count, 0), p.stamps_required, p.reward_text
  from loopkit.programs p
  left join loopkit.cards c on c.program_id = p.id and c.phone = p_phone
  where p.id = p_program and p.active;
$$;

-- RLS: vendor reads only their own rows; writes go through the functions above.
alter table loopkit.programs     enable row level security;
alter table loopkit.cards        enable row level security;
alter table loopkit.stamp_events enable row level security;

create policy programs_own on loopkit.programs
  for all using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));
create policy cards_own on loopkit.cards
  for select using (loopkit.owns_program(program_id));
create policy events_own on loopkit.stamp_events
  for select using (
    loopkit.owns_program((select program_id from loopkit.cards where id = card_id))
  );

-- Data-API grants (be explicit).
grant usage on schema loopkit to anon, authenticated, service_role;
grant select, insert, update on loopkit.programs to authenticated;
grant select on loopkit.cards, loopkit.stamp_events to authenticated;
grant all on all tables in schema loopkit to service_role;
grant execute on function loopkit.owns_program(uuid) to authenticated, service_role;
grant execute on function loopkit.add_stamp(uuid, text) to authenticated;
grant execute on function loopkit.redeem(uuid) to authenticated;
grant execute on function loopkit.card_status(uuid, text) to anon, authenticated, service_role;
```

- [ ] **Step 2: Schema guard test** `test/db/schema.test.ts` — read the SQL file, assert it defines the 3 tables + 4 functions + RLS enabled (regex presence checks, like qkit's `test/db/schema.test.ts`).

- [ ] **Step 3: Run test — passes.** Commit `feat: loopkit schema + RLS + stamp/redeem functions`.

---

### Task 5: Auth — login + callback (port from qkit)

**Files:**

- Create: `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/components/ui/{button,input,label}.tsx`, `src/lib/utils.ts`.
- Reference: `../qkit/src/app/(auth)/login/page.tsx`, `../qkit/src/app/auth/callback/route.ts`, and the merqo login (`../merqo/src/app/login/page.tsx`) for the leaner no-RHForm version.

**Interfaces:**

- Consumes: `createClient` (Task 2).
- Produces: working email/password + Google sign-in; `/auth/callback` exchanges code → redirects to `/dashboard` (safe same-origin `next`).

- [ ] **Step 1: Port shadcn `button`/`input`/`label` + `cn`** from qkit `src/components/ui/*` + `src/lib/utils.ts`.
- [ ] **Step 2: Port `/auth/callback/route.ts`** from qkit; default redirect `/dashboard`; pass `emailRedirectTo`/`redirectTo` to `${origin}/auth/callback`.
- [ ] **Step 3: Build the login page** modeled on merqo's `login/page.tsx` (local-state, Google + email/password + signup with `emailRedirectTo`), redirect to `/dashboard`, loopkit branding placeholder heading.
- [ ] **Step 4: Verify** `pnpm check` + `pnpm build`. Commit `feat: vendor auth — Google + email login`.

---

### Task 6: Program setup (server action + page)

**Files:**

- Create: `src/lib/program.ts`, `src/app/setup/page.tsx`, `src/app/setup/actions.ts`, `test/lib/program.test.ts`.

**Interfaces:**

- Consumes: `createServerClient` (authed), `normalizePhone` (not here).
- Produces: `getProgram(): Promise<Program | null>` (the signed-in vendor's program), `programInputSchema` (Zod), `saveProgramAction(formData)` server action (upsert program for `auth.uid()`).
- Types: `type Program = { id: string; name: string; stamps_required: number; reward_text: string; active: boolean }`.

- [ ] **Step 1: Failing test** for `programInputSchema` in `test/lib/program.test.ts`: valid `{name, stamps_required:10, reward_text}` passes; `stamps_required:1` and `:21` fail; empty name fails.
- [ ] **Step 2: Implement** `src/lib/program.ts` — `programInputSchema = z.object({ name: z.string().trim().min(1).max(60), stamps_required: z.coerce.number().int().min(2).max(20), reward_text: z.string().trim().min(1).max(80) })`, `type Program`, and `getProgram()` (server client select `programs` where vendor via RLS, `maybeSingle`).
- [ ] **Step 3: Run test — passes.**
- [ ] **Step 4: Server action** `src/app/setup/actions.ts` (`"use server"`): `requireVendor()` (getUser or redirect), `programInputSchema.safeParse`, upsert `programs` with `vendor_id = user.id` (onConflict `vendor_id`), `revalidatePath("/dashboard")`, redirect `/dashboard`.
- [ ] **Step 5: Page** `src/app/setup/page.tsx` — server component; load existing program; form (name, stamps_required, reward_text) → `saveProgramAction`. shadcn inputs.
- [ ] **Step 6: Verify + commit** `feat: program setup (create/edit loyalty card)`.

---

### Task 7: Stamp flow — dashboard (stamp / progress / redeem)

**Files:**

- Create: `src/app/dashboard/page.tsx`, `src/app/dashboard/actions.ts`, `src/app/dashboard/stamp-form.tsx` (client), `src/lib/loyalty.ts`, `test/lib/loyalty.test.ts`.

**Interfaces:**

- Consumes: `getProgram`, `normalizePhone`, `createServerClient`.
- Produces: `stampAction(prev, formData): Promise<StampState>` (normalize phone → call `loopkit.add_stamp` RPC → return card + reward-ready flag), `redeemAction(formData)` (call `loopkit.redeem`), pure `rewardReady(stamp_count, stamps_required): boolean`.
- Types: `type StampState = { status: "idle"|"ok"|"error"; card?: { phone:string; stamp_count:number }; rewardReady?: boolean; message?: string }`.

- [ ] **Step 1: Failing test** `test/lib/loyalty.test.ts` for `rewardReady`: `rewardReady(10,10)===true`, `rewardReady(9,10)===false`, `rewardReady(11,10)===true`.
- [ ] **Step 2: Implement** `src/lib/loyalty.ts` → `export const rewardReady = (c:number,n:number)=> c>=n;`
- [ ] **Step 3: Run — passes.**
- [ ] **Step 4: `stampAction`** in `dashboard/actions.ts`: gate `requireVendor`, `getProgram` (else error "set up your card first"), `normalizePhone(formData.email? phone)` (reject invalid → error), `supabase.rpc("add_stamp", { p_program, p_phone })` via authed server client, compute `rewardReady`, return `StampState`. `redeemAction`: `rpc("redeem", { p_card })`, `revalidatePath("/dashboard")`.
- [ ] **Step 5: `stamp-form.tsx`** (client, `useActionState(stampAction)`): phone input + Stamp button; on `ok` show progress "3/10" + phone; if `rewardReady` show Redeem button (form → `redeemAction`).
- [ ] **Step 6: `dashboard/page.tsx`** server: `requireVendor`; `getProgram` (null → redirect `/setup`); render program summary (name, reward, N) + `<StampForm/>` + recent activity (last events).
- [ ] **Step 7: Component test** (jsdom) — stamp-form shows progress + reward-ready state given a mocked action.
- [ ] **Step 8: Verify + commit** `feat: stamp a customer + redeem reward`.

---

### Task 8: Customers list + search

**Files:**

- Create: `src/app/dashboard/customers/page.tsx`, `src/lib/cards.ts`, `test/lib/cards.test.ts`.

**Interfaces:**

- Produces: `listCards(programId, q?): Promise<CardRow[]>` (select cards by program, optional phone `ilike`, order by `updated_at desc`), pure `formatCard(row)` if needed.

- [ ] **Step 1..N (TDD):** test `listCards` query builder via a mocked supabase (mirror merqo `vendor.test.ts` mock style); page renders rows (phone, `stamp_count`/N, `reward_count`, last visit) + a `?q=` search box (server-side filter). Commit `feat: customers list + search`.

---

### Task 9: Public customer view `/c`

**Files:**

- Create: `src/app/c/page.tsx`, `src/app/c/actions.ts`.

**Interfaces:**

- Consumes: `createServiceClient` (server-only) or the anon `card_status` RPC; `normalizePhone`.
- Produces: a public page where a customer enters phone → server action calls `rpc("card_status", {p_program, p_phone})` → shows `stamp_count/stamps_required` + `reward_text`. Program id from `?p=<programId>` query (the vendor shares `/c?p=…`).

- [ ] **Steps:** page + `checkStatusAction` (normalize phone, RPC, return status or "no card yet"). No table reads, no PII. Progress dots UI. Commit `feat: public customer stamp check`.

---

### Task 10: `/api/merqo/metrics` + contract

**Files:**

- Create: `src/app/api/merqo/metrics/route.ts`, `src/lib/metrics.ts`, `test/lib/metrics.test.ts`, `test/contract/merqo-metrics.contract.test.ts`.

**Interfaces:**

- Produces: `computeLoopkitMetrics(input): MetricsPayload` (pure), and `GET /api/merqo/metrics` (bearer-guard identical to qkit's `bearerOk`, service-client reads, 503 on upstream error).
- Payload MUST include the fields merqo's `metricsPayloadSchema` requires (check `../merqo/src/lib/metrics-schema.ts`): map loopkit → `active_vendors` (active programs), `total_vendors` (programs), plus loopkit-specific `stamps_7d`, `rewards_redeemed`, `cards_total`, `signups_7d`. Return `product: "loopkit"`, `generated_at`.

- [ ] **Step 1:** Read `../merqo/src/lib/metrics-schema.ts` — copy the exact required field set into `computeLoopkitMetrics` return so merqo renders without change; add loopkit extras.
- [ ] **Step 2: TDD** `computeLoopkitMetrics` (pure over rows: programs, cards, events).
- [ ] **Step 3:** Route: port qkit `bearerOk` + service-client reads (programs, cards, stamp_events counts) → `computeLoopkitMetrics`.
- [ ] **Step 4: Contract test** — build a sample payload, assert `metricsPayloadSchema.safeParse` (import merqo's schema via relative path or copy it into `test/contract`) succeeds.
- [ ] **Step 5: Verify + commit** `feat: merqo metrics endpoint (bearer)`.

---

### Task 11: Landing + brand (frontend-design)

**Files:**

- Create: `src/app/page.tsx` + `src/components/landing/*`; `src/app/globals.css` (loopkit brand tokens); `src/app/layout.tsx` metadata + fonts.

- [ ] **Step 1:** Invoke `frontend-design` for loopkit's OWN identity (loyalty/repeat-customer vibe — warm, rewarding; distinct from merqo neutral + qkit ember). Define tokens (4–6 hex, display/body/mono faces, a signature element).
- [ ] **Step 2:** Build a light landing (hero: "Turn one-time buyers into regulars", how-it-works 3 steps, a stamp-card visual, CTA → sign up) + footer. Static-prerendered; near-zero client JS.
- [ ] **Step 3:** Verify (`pnpm check`, build, screenshot light+dark). Commit `feat: loopkit landing + brand`.

---

### Task 12: CI + deploy runbook

**Files:**

- Create/verify: `.github/workflows/ci.yml` (check + unit + build + e2e smoke; branch `main`), `security.yml`, `dependabot.yml` (mirror merqo's, which are known-green), `vercel.json` (`regions: ["sin1"]`), `e2e/smoke.spec.ts` (landing + login render), `docs/DEPLOY.md`.

- [ ] **Step 1:** Port merqo's `.github/workflows/{ci,security}.yml` + `dependabot.yml` + `vercel.json` (they're proven green — branch `main`, node 24, pnpm via `packageManager`, no CodeQL on private repo).
- [ ] **Step 2:** `e2e/smoke.spec.ts` — landing heading + login "Continue with Google" render (dummy Supabase env).
- [ ] **Step 3:** `docs/DEPLOY.md` — expose `loopkit` schema; apply `0001`; set Vercel envs (shared Supabase creds + `MERQO_METRICS_SECRET`); in merqo update the `loopkit` `products` row (`app_url`, `metrics_url`, `metrics_secret`, status→`live`); curl-verify the metrics endpoint.
- [ ] **Step 4:** Push; confirm CI green. Commit `chore: CI + deploy runbook`.

---

## Self-Review

- **Spec coverage:** program setup (T6), stamp/redeem (T7), customers (T8), public `/c` (T9), metrics (T10), auth (T5), schema+RLS+fns (T4), phone (T3), landing/brand (T11), merqo integration (T10+T12), scaffold/harness (T1/T12). All spec sections mapped.
- **Placeholders:** infra tasks say "port qkit `<exact file>`" (a real, actionable source), not "TODO"; domain logic (schema, phone, loyalty, metrics) is spelled out with code.
- **Type consistency:** `normalizePhone` shape, `Program`, `StampState`, `rewardReady`, RPC names (`add_stamp`/`redeem`/`card_status`) consistent across tasks + match the migration.
- **Scope:** single product v1, one implementation pass; ~12 tasks each independently testable.
