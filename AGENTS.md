<!-- templateCentral: nextjs@5.8.0 (Supabase variant — shared project, schema per kit) -->

# AGENTS.md — loopkit

> STOP — This project diverges from the stock templateCentral Next.js stack on
> the data layer only. Auth/DB/realtime are **Supabase** (`@supabase/ssr`), not
> better-auth + Drizzle. Authorization is enforced in Postgres via **RLS**, not
> an app repository layer. Runtime matches tc: Next 16, route protection in
> `src/proxy.ts`, and `cookies()`/`headers()`/`params`/`searchParams` are async.

## What loopkit is

Standalone digital stamp-card loyalty for SG small vendors; a Merqo kit; owns
the `loopkit` schema in the shared Supabase project; reports metrics to merqo
over HTTP.

## Stack

Next.js 16 · App Router · Turbopack · TypeScript strict · Tailwind v4 · shadcn/ui
(new-york) · React Hook Form · Zod · Supabase (`@supabase/ssr`) · Vitest ·
pnpm 11 · Node ≥24 · deploy target: Vercel

## Commands

```bash
pnpm dev          # dev server — http://localhost:3000
pnpm build        # production build
pnpm test         # run test suite (vitest)
pnpm test:mutation # stryker mutation testing (scoped to src/lib; advisory)
pnpm test:e2e     # playwright e2e smoke (needs local Supabase up)
pnpm check        # prettier --check + eslint + tsc --noEmit
pnpm format       # prettier --write
```

## File Layout

```
src/app/                — app router (pages, layouts, server actions)
src/proxy.ts            — Supabase session refresh + /dashboard,/setup guard (Next 16)
src/lib/supabase/       — browser / server / service clients + middleware helper
src/lib/types.ts        — DB types (placeholder — mirror of supabase/migrations once schema lands)
src/lib/utils.ts        — cn() + shared formatting helpers
src/components/ui/      — shadcn primitives (CLI-managed, do not hand-edit)
supabase/migrations/    — SQL schema + RLS (to be added — this skeleton has none yet)
```

This is a clean skeleton — no domain code (schema/programs/cards/auth pages)
has been built yet. See `docs/superpowers/specs/2026-07-07-loopkit-core-design.md`
and `docs/superpowers/plans/2026-07-07-loopkit-core.md` for the planned data
model and MVP scope before adding it.

## Rules (always)

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every boundary (forms + server actions).
- Authorization lives in **RLS policies**, not in app code. Never widen a policy
  to "fix" a query — fix the query or the session instead.
- Use the **service-role client only** in Server Actions / Route Handlers, never
  in client components. It bypasses RLS.
- No secrets in `NEXT_PUBLIC_*`. `NEXT_PUBLIC_SUPABASE_*` are inlined at build —
  rebuild after changing them.
- `@supabase/ssr` and `@supabase/supabase-js` versions must stay compatible
  (ssr 0.10.x ↔ supabase-js 2.10x) or every query degrades to `never`.
- All Supabase clients (`src/lib/supabase/{client,server,middleware}.ts`) are
  scoped to `db: { schema: "loopkit" }` — loopkit owns that schema in the
  shared Merqo Supabase project and must never read/write another kit's schema
  (e.g. qkit's) directly. Cross-kit data goes over HTTP (the merqo metrics API),
  not a cross-schema query.
- After adding the schema, create `supabase/migrations/` and regenerate
  `src/lib/types.ts` (or run `supabase gen types typescript` once the CLI is
  linked) — keep the `loopkit` schema key in sync everywhere it's referenced.

## Skills

### Project skills — check here first (`.claude/skills/`)

| Skill               | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `/next-verify`      | typecheck + lint + test in one pass                          |
| `/supabase-migrate` | apply `supabase/migrations` + regenerate types (safety gate) |

### templateCentral plugin skills

templateCentral has **no Supabase support** (auth=better-auth, db=Drizzle/Kysely/Mongoose,
no realtime). Use only the stack-agnostic ones here:

| Skill                       | When to use                   |
| --------------------------- | ----------------------------- |
| `templatecentral:standards` | naming/validation drift check |

Do **not** run `templatecentral:add (auth)` or `(database)` — they install
better-auth / Drizzle and will break RLS + realtime.

## AI Harness

PreToolUse: blocks secret files (exit 2): `.env*` (except `.env.example`),
cert files (`.pem`/`.key`/`.p12`/`.pfx`/`.secret`), `credentials.json`/`.netrc`/`.secrets`;
and blocks `--no-verify`. App code, skills, specs, and `.github/workflows/`
unrestricted.
UserPromptSubmit: pattern-checks prompts for injection phrases; exit 2 blocks.
PostToolUse: `tsc --noEmit --incremental` after every Edit/Write. Feedback-only.
Stop: exits 0 when `stop_hook_active` (no re-entry loop); else runs the test
suite, exit 2 feeds failures back, exit 0 on pass.
SessionStart (startup|resume|compact): re-injects first 30 lines of this file —
the documented inject path (PostCompact stdout is ignored, cannot inject context).
`permissions`: max-privilege — bare-tool `allow` (Bash/Read/Edit/Write/web/Skill/
Task) so common work doesn't prompt; `deny` covers secret reads/edits (`.env.local`
and other `.env.<env>` variants, `./secrets/**` — `.env.example` is the one
whitelisted env file) and irreversible ops (`rm -rf`, `git push --force`/`-f`,
`git reset --hard`, `git clean -fd/-fx`, `git filter-branch`, ref-delete). Deny
always wins (enforced even under bypass); it's a guardrail, not a sandbox.
Project skills (directory form, `<name>/SKILL.md`): `.claude/skills/` |
Manifest: `.claude/harness.json`

## Skills Security

- Review `SKILL.md` before installing any third-party skill — treat skills like packages.
- Scope `allowed-tools:` to the minimum (e.g. `Bash(git *)` not `Bash`).
- Never install skills that hardcode secrets or make unlisted outbound calls.

## Project-Specific Notes

- This repo is a fresh harness seeded from the sibling project `qkit` (same
  templateCentral Supabase variant, same shared Supabase project, different
  schema). No domain code (programs/cards/stamps, auth pages, dashboard) exists
  yet — that's later work, tracked in `docs/superpowers/plans/2026-07-07-loopkit-core.md`.
- Plan of record: `docs/superpowers/plans/2026-07-07-loopkit-core.md` (design:
  `docs/superpowers/specs/2026-07-07-loopkit-core-design.md`).

<!-- [[post-harness]] — reserved for trace capture and meta-harness integration -->
