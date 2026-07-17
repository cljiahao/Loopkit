# CONSTITUTION.md

## 1. Purpose

This document defines the non-negotiable invariants for **loopkit**. It
applies to all contributors — human and AI agent alike. When `AGENTS.md`,
templateCentral skills, or any other guidance conflicts with this document,
**this document wins**. No PR may be merged that violates these rules
without an explicit `## Human Approval Override` section in the PR
description.

## 2. Architecture Invariants

- Auth/DB/realtime are Supabase (`@supabase/ssr`), not better-auth/Drizzle —
  this is loopkit's deliberate divergence from the stock templateCentral
  Next.js stack. Never introduce better-auth or a Drizzle/Kysely/Mongoose
  layer.
- Authorization lives in Postgres RLS policies and `security definer` RPCs,
  never in an app-code repository layer. Never widen a policy to "fix" a
  query — fix the query or the session instead.
- All Supabase clients (`src/lib/supabase/{client,server,middleware}.ts`)
  are scoped to `db: { schema: "loopkit" }`. loopkit owns that schema in
  the shared Merqo Supabase project and must never read/write another
  kit's schema (e.g. qkit's) directly — cross-kit data goes over HTTP (the
  merqo metrics API), not a cross-schema query.
- The service-role client is used only in Server Actions / Route Handlers,
  never in client components — it bypasses RLS.

## 3. Security Invariants

- Secrets never appear in code, git, logs, or build output — use
  environment variables; `NEXT_PUBLIC_*` never carries a secret (it is
  inlined at build time, exposed to every browser).
- `@supabase/ssr` and `@supabase/supabase-js` versions must stay compatible
  (ssr 0.10.x ↔ supabase-js 2.10x) or every query silently degrades to
  `never`.
- Route protection is enforced in `src/proxy.ts` for `/dashboard` and
  `/setup`.

## 4. Testing Invariants

- TypeScript strict — no `any`, no `@ts-ignore`.
- Validate all user input with Zod at every form/server-action boundary.
- New Server Actions and RPC-calling code need a Vitest test covering the
  success path and at least one error/authorization-failure path.
- CI must stay green — no PR may be merged with failing tests.
- SQL migrations are hand-verified, not automated-tested (no linked
  Supabase CLI in this environment) — every migration PR includes a manual
  review checklist instead of a test-runner step.

## 5. Git & PR Invariants

- Branch from `main` (the only long-lived branch — no `uat`/`develop`).
  Protected: no direct commits to `main`.
- After every new migration, regenerate `src/lib/types.ts` — keep the
  `loopkit` schema key in sync everywhere it's referenced.

## 6. Agent Governance Rules

### Protected files — human approval required

The following files require explicit human approval noted in the PR under
`## Protected File Changes`. Agents MUST NOT modify them without approval.

- `AGENTS.md` / `CLAUDE.md` — agent instruction files
- `docs/CONSTITUTION.md` — this document
- `.claude/settings.json` / `.claude/settings.local.json` — harness wiring
- `.claude/hooks/*` — enforcement hooks
- `.claude/harness.json`, `.claude/verify-harness.sh`,
  `.claude/regen-harness.sh` — harness integrity baseline/verifier
- `lefthook.yml`, `.lefthook/*`, `.gitleaks.toml` — git-hook enforcement
- `.github/workflows/*` — CI pipeline definitions
- `Dockerfile` (none yet — reserved if one is added)

### Behavioural rules

- Run the quality gate (`pnpm check`) before declaring any task done.
- Never use `--no-verify` on commits — this bypasses pre-commit hooks.
- Work on a feature branch — never commit directly to `main`.
