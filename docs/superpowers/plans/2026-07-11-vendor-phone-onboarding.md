# Vendor phone onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new vendor sign up with just a name and a Singapore phone
number — no Google account, no email/password — as a third option
alongside the two `/login` already offers.

**Prerequisite — apply after `2026-07-11-vendor-identity-profile-ui.md`:**
this plan does **not** create the `loopkit.vendors` table. That plan's
Task 1 creates `supabase/migrations/0017_loopkit_vendor_profile.sql` with
`loopkit.vendors(vendor_id, name, phone, created_at, updated_at)` + RLS
policy `vendors_own` + the `vendor-images` storage bucket. If this plan is
ever executed first, pull that migration forward as this plan's Task 0
instead of proceeding — do not write a second, differently-shaped
`loopkit.vendors` table.

**Architecture:** Per spec
(`docs/superpowers/specs/2026-07-11-vendor-phone-onboarding-design.md`,
Option 1, resolved): no Supabase phone-OTP provider, no SMS cost. The
vendor's phone is a plain identity value, not a verified auth credential —
the same trust model loopkit's customer side already uses for `cards.phone`.
`supabase.auth.signInAnonymously()` establishes a real session client-side;
a server action then upserts `{ name, phone }` onto `loopkit.vendors` for
that session's `auth.uid()`. `requireVendor()`'s contract
(`{ user: User }`) is untouched — an anonymous-auth user is still a real
Supabase `User`.

**Tech Stack:** Next.js 16 App Router (client component + server action),
`@supabase/ssr`, Zod, Vitest, this repo's existing mocked-Supabase test
convention (see `test/app/change-type-action.test.ts`).

## Global Constraints

- Google OAuth (`src/app/login/page.tsx:63-76`) and email/password
  (`src/app/login/page.tsx:84-121`) are untouched — this is a third,
  additive option, not a replacement.
- No SMS/OTP provider, no `signInWithOtp({ phone })` — reuses
  `signInAnonymously()` plus loopkit's own phone-as-data-field convention
  (`normalizePhone`, `src/lib/phone.ts`), same validation rule already
  enforced customer-side.
- No uniqueness constraint on `name` or `phone` — duplicates across
  vendors are explicitly allowed.
- `requireVendor()` (`src/lib/auth.ts`) keeps its exact signature and
  behavior — not modified by this plan.
- No device-recovery flow for anonymous sessions (accepted limitation,
  spec's Open Questions #4) — out of scope for this plan.
- No merging of vendor-side and customer-side phone identity — fully
  separate concepts, no shared table/column.

---

### Task 1: `vendorPhoneOnboardAction` — schema-adjacent server action

**Files:**

- Create: `src/app/login/actions.ts`
- Create: `test/app/vendor-onboard-action.test.ts`

**Interfaces:**

- Produces: `vendorPhoneOnboardAction(name: string, phoneRaw: string):
Promise<{ error?: string }>` — exported `"use server"` function. Task 2
  calls this after establishing an anonymous session client-side.
- Consumes: `loopkit.vendors` table (from the prerequisite migration,
  `vendor_id` PK), `requireVendor()` (`src/lib/auth.ts`), `normalizePhone()`
  (`src/lib/phone.ts`), `createServerClient()`
  (`src/lib/supabase/server.ts`).

- [ ] **Step 1: Write the failing test**

Create `test/app/vendor-onboard-action.test.ts`, mocking
`requireVendor`/`createServerClient` the same way
`test/app/change-type-action.test.ts` does:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireVendor: vi.fn(async () => ({ user: { id: "v1" } })),
}));

const upsertCalls: Array<{ values: unknown; onConflict: string }> = [];
const fromMock = vi.fn(() => ({
  upsert: (values: unknown, opts: { onConflict: string }) => {
    upsertCalls.push({ values, onConflict: opts.onConflict });
    return Promise.resolve({ error: null as { message: string } | null });
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}));

import { vendorPhoneOnboardAction } from "@/app/login/actions";

describe("vendorPhoneOnboardAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertCalls.length = 0;
  });

  it("rejects an empty name without writing", async () => {
    const res = await vendorPhoneOnboardAction("  ", "91234567");
    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid phone without writing", async () => {
    const res = await vendorPhoneOnboardAction("Kopi Corner", "12345");
    expect(res.error).toBeTruthy();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("upserts a normalized phone and trimmed name on the happy path", async () => {
    const res = await vendorPhoneOnboardAction(" Kopi Corner ", "91234567");
    expect(res.error).toBeUndefined();
    expect(upsertCalls[0]).toMatchObject({
      values: { vendor_id: "v1", name: "Kopi Corner", phone: "+6591234567" },
      onConflict: "vendor_id",
    });
  });

  it("allows a duplicate name/phone already used by another vendor", async () => {
    // No uniqueness check exists client-side or in this action — the DB has
    // none either (spec requirement). Asserting only that no pre-check runs.
    const res = await vendorPhoneOnboardAction("Kopi Corner", "91234567");
    expect(res.error).toBeUndefined();
  });

  it("surfaces a Supabase error without throwing", async () => {
    fromMock.mockReturnValueOnce({
      upsert: () => Promise.resolve({ error: { message: "db down" } as const }),
    });
    const res = await vendorPhoneOnboardAction("Kopi Corner", "91234567");
    expect(res.error).toBeTruthy();
  });
});
```

Run `pnpm test vendor-onboard-action` — confirm it fails (module doesn't
exist yet).

- [ ] **Step 2: Implement the action**

Create `src/app/login/actions.ts`:

```typescript
"use server";

import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { requireVendor } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

const nameSchema = z.string().trim().min(1).max(60);

// Unverified name+phone vendor onboarding (spec:
// 2026-07-11-vendor-phone-onboarding-design.md, Option 1). Called after the
// client has already established an anonymous session via
// signInAnonymously() — requireVendor() here just reads that session, it
// does not create one. Phone is stored as vendor-supplied data, not a
// verified credential — same trust model as a customer typing their own
// number at /c today.
export async function vendorPhoneOnboardAction(
  name: string,
  phoneRaw: string,
): Promise<{ error?: string }> {
  const { user } = await requireVendor();

  const parsedName = nameSchema.safeParse(name);
  if (!parsedName.success) return { error: "Enter your name." };

  const phone = normalizePhone(phoneRaw);
  if (!phone.ok) return { error: "Enter a valid Singapore phone number." };

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("vendors")
    .upsert(
      { vendor_id: user.id, name: parsedName.data, phone: phone.phone },
      { onConflict: "vendor_id" },
    );
  if (error) return { error: "Couldn't save your details. Try again." };
  return {};
}
```

- [ ] **Step 3: Verify**

Run `pnpm test vendor-onboard-action` — all 5 cases pass. Run `pnpm check`
— no type errors (the `vendors` table type comes from the prerequisite
migration's `src/lib/types.ts` update; if that hasn't landed yet in this
checkout, `.from("vendors")` will resolve to `never` — confirms the
prerequisite ordering matters, not a bug in this plan).

---

### Task 2: `/login` UI — "Continue with name & phone" option

**Files:**

- Modify: `src/app/login/page.tsx`

**Interfaces:**

- Consumes: `vendorPhoneOnboardAction` (Task 1), `normalizePhone` (client-side
  preview only — the real validation is server-side in Task 1),
  `supabase.auth.signInAnonymously()` (`@supabase/ssr` browser client,
  `src/lib/supabase/client.ts`).
- No new exports — this task is UI-only.

- [ ] **Step 1: Add the toggle and form**

In `LoginForm` (`src/app/login/page.tsx`), add state for the phone-onboard
panel and its two fields, and a submit handler, alongside the existing
`mode`/`email`/`password`/`error`/`busy` state:

```typescript
const [showPhoneOnboard, setShowPhoneOnboard] = useState(false);
const [vendorName, setVendorName] = useState("");
const [vendorPhone, setVendorPhone] = useState("");

async function submitPhoneOnboard(e: React.FormEvent) {
  e.preventDefault();
  setBusy(true);
  setError(null);
  const supabase = createClient();
  const { error: anonError } = await supabase.auth.signInAnonymously();
  if (anonError) {
    setError(anonError.message);
    setBusy(false);
    return;
  }
  const result = await vendorPhoneOnboardAction(vendorName, vendorPhone);
  setBusy(false);
  if (result.error) {
    setError(result.error);
    return;
  }
  router.push("/dashboard");
  router.refresh();
}
```

Add the import: `import { vendorPhoneOnboardAction } from "@/app/login/actions";`

- [ ] **Step 2: Wire the UI**

Below the existing "Continue with Google" button
(`src/app/login/page.tsx:212-221`), add a second outline button that
toggles the panel instead of submitting immediately (matches this page's
existing pattern of a button-first, form-reveals-after UX for anything that
isn't the primary email/password path):

```tsx
<Button
  type="button"
  variant="outline"
  onClick={() => setShowPhoneOnboard((v) => !v)}
  disabled={busy}
  className="mt-2.5 h-12 w-full gap-2.5 rounded-xl text-[0.95rem] font-medium"
>
  Continue with name & phone
</Button>;

{
  showPhoneOnboard && (
    <form onSubmit={submitPhoneOnboard} className="mt-5 space-y-5">
      <div className="space-y-2">
        <Label
          htmlFor="vendor-name"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Your name or business
        </Label>
        <Input
          id="vendor-name"
          required
          placeholder="Kopi Corner"
          className="h-11 rounded-xl"
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label
          htmlFor="vendor-phone"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Phone number
        </Label>
        <Input
          id="vendor-phone"
          type="tel"
          required
          placeholder="9123 4567"
          className="h-11 rounded-xl"
          value={vendorPhone}
          onChange={(e) => setVendorPhone(e.target.value)}
        />
      </div>
      <Button
        type="submit"
        size="lg"
        className="h-12 w-full rounded-xl text-base font-semibold"
        disabled={busy}
      >
        {busy ? "Please wait…" : "Continue"}
      </Button>
    </form>
  );
}
```

This panel only makes sense in `signin`-equivalent context (there's no
separate "signup" mode for this path — one form does both, matching
`signInAnonymously()`'s create-or-nothing semantics). Render it regardless
of `mode` — unlike the email/password block, it doesn't branch on
`isSignin`.

- [ ] **Step 2: Manual verification**

Per this codebase's existing UI-change convention (no component test for
this class of local toggle state — matches spec D's precedent for
`/c`'s local-only UI). Run `pnpm dev`, open `/login`, click "Continue with
name & phone," submit with an empty name (expect inline error, no
navigation), submit with an invalid phone (expect inline error), submit
with valid values (expect redirect to `/dashboard`, confirm a `vendors` row
exists for the new anonymous user with the entered name/phone).

- [ ] **Step 3: Final verification**

Run `pnpm check` (prettier + eslint + tsc) and `pnpm test` (full suite) —
both clean.

## Out of scope (matches spec)

- Real SMS/OTP verification.
- Device-recovery flow for anonymous sessions.
- Any change to `/dashboard`, `/setup`, or other post-login pages.
