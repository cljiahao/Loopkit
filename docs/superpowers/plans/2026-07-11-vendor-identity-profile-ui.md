# Vendor identity & profile UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give loopkit a real vendor identity (stall name + optional photo),
fix the profile/plan duplication bug, and swap the nav avatar's initials
source from email to stall name — per
`docs/superpowers/specs/2026-07-11-vendor-identity-profile-ui-design.md`
(all open questions resolved, no remaining decisions).

**Architecture:** One additive table, `loopkit.vendors` (lazily created,
`vendor_id` PK referencing `auth.users`, mirrors `vendor_pro`'s shape), plus
a public `vendor-images` Storage bucket. A new `src/lib/vendor.ts` owns
reads/writes. The nav's existing sticky header / dropdown / `size-8` avatar
structure is untouched — only its label/avatar _source_ changes. The profile
page is rewritten to be pure identity (stall name, photo, email, password);
plan/tier content is deleted from it, not duplicated elsewhere.

**Tech Stack:** Next.js 16 App Router, Supabase `@supabase/ssr`, Zod, Vitest,
this repo's existing regex-on-migration-text schema test convention.

## Global Constraints

- `dashboard-nav.tsx`'s overall structure (sticky header, dropdown menu,
  `size-8` avatar shape, tier badge, mobile burger panel) is reused as-is —
  no navbar rebuild.
- `/dashboard/plan/page.tsx`'s content is untouched — it already owns
  tier/upgrade messaging correctly; only `/profile` changes.
- No changes to auth methods, RLS on `programs`/`cards`, `vendor_pro`, or
  any engine code.
- `requireVendor()`'s signature (`{ user: User }`) is unchanged — vendor
  profile lookup is additive, not a replacement for the `auth.users` check.
- No `display_name` concept separate from stall name, no onboarding-flow
  change to collect a stall name at signup (loopkit has no onboarding step
  today) — this plan only adds the field and a place to set it after the
  fact.
- `next.config.ts` already has `images.remotePatterns` covering
  `*.supabase.co` (verified — see Task 4) — the Supabase Storage public URL
  for the new `vendor-images` bucket is already covered. No `next.config.ts`
  change in this plan.

---

### Task 1: Schema — `loopkit.vendors` table + `vendor-images` bucket

**Files:**

- Create: `supabase/migrations/0017_loopkit_vendor_profile.sql`
- Create: `test/db/vendor-profile-schema.test.ts`
- Modify: `src/lib/types.ts` (add a `vendors` table entry)

**Interfaces:**

- Produces: `loopkit.vendors(vendor_id, name, phone, created_at,
updated_at)`, RLS policy `vendors_own`, public-read `vendor-images`
  Storage bucket + per-vendor-folder object policies.
- Consumes: nothing new — `auth.users`, `storage.buckets`/`storage.objects`
  (Supabase built-ins).
- Consumed by: Task 2 (`src/lib/vendor.ts` reads/writes this table), Task 4
  (image uploader writes to `vendor-images`).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0017_loopkit_vendor_profile.sql`:

```sql
-- loopkit.vendors: a row per vendor, created lazily (no onboarding step
-- exists today — a vendor's first save via /profile is their first write
-- here). Mirrors vendor_pro's shape (0007_loopkit_multiprogram.sql):
-- vendor_id as primary key referencing auth.users, not a surrogate id.
--
-- phone is included even though this plan never writes it, because the
-- vendor-phone-onboarding spec (docs/superpowers/specs/2026-07-11-vendor-
-- phone-onboarding-design.md) needs the same table with the same primary
-- key shape and explicitly consumes this migration rather than redefining
-- it. Do not let a later migration re-create loopkit.vendors.
create table loopkit.vendors (
  vendor_id  uuid primary key references auth.users(id) on delete cascade,
  name       text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table loopkit.vendors enable row level security;

create policy vendors_own on loopkit.vendors
  for all using (vendor_id = (select auth.uid()))
  with check (vendor_id = (select auth.uid()));

grant select, insert, update on loopkit.vendors to authenticated;
grant all on loopkit.vendors to service_role;

-- Public-read bucket for vendor profile photos. Public because the stamp
-- card / /c pages are unauthenticated and may eventually show a vendor
-- photo to customers — no reason to block that later with a private bucket
-- now.
insert into storage.buckets (id, name, public)
values ('vendor-images', 'vendor-images', true)
on conflict (id) do nothing;

create policy vendor_images_public_read
  on storage.objects for select
  using (bucket_id = 'vendor-images');

create policy vendor_images_vendor_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy vendor_images_vendor_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy vendor_images_vendor_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vendor-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Write the schema test**

Create `test/db/vendor-profile-schema.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const sql = readFileSync(
  "supabase/migrations/0017_loopkit_vendor_profile.sql",
  "utf8",
);

describe("0017 vendor profile", () => {
  it("creates loopkit.vendors keyed by vendor_id", () => {
    expect(sql).toMatch(
      /create table loopkit\.vendors \(\s*vendor_id\s+uuid primary key references auth\.users\(id\)/i,
    );
    expect(sql).toMatch(/name\s+text/i);
    expect(sql).toMatch(/phone\s+text/i);
  });

  it("enables RLS with a self-only policy", () => {
    expect(sql).toMatch(
      /alter table loopkit\.vendors enable row level security/i,
    );
    expect(sql).toMatch(
      /create policy vendors_own on loopkit\.vendors\s*\n\s*for all using \(vendor_id = \(select auth\.uid\(\)\)\)/i,
    );
  });

  it("grants authenticated select/insert/update, service_role all", () => {
    expect(sql).toMatch(
      /grant select, insert, update on loopkit\.vendors to authenticated/i,
    );
    expect(sql).toMatch(/grant all on loopkit\.vendors to service_role/i);
  });

  it("creates the public vendor-images bucket with per-vendor-folder object policies", () => {
    expect(sql).toMatch(
      /insert into storage\.buckets \(id, name, public\)\s*\n\s*values \('vendor-images', 'vendor-images', true\)/i,
    );
    expect(sql).toMatch(/vendor_images_public_read/i);
    expect(sql).toMatch(/vendor_images_vendor_insert/i);
    expect(sql).toMatch(
      /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/,
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm vitest run test/db/vendor-profile-schema.test.ts`
Expected: PASS, all 4 tests (this repo's established convention: a
regex-on-file-text test passes as soon as the migration file exists with
matching text — no separate RED phase, matching
`test/db/program-replacement-schema.test.ts`).

- [ ] **Step 4: Add the `vendors` table to `src/lib/types.ts`**

Add a new entry alongside `vendor_pro`'s (same file, `Database["public"]`
— check the existing `vendor_pro` entry's exact location and mirror its
Row/Insert/Update/Relationships shape):

```typescript
vendors: {
  Row: {
    vendor_id: string;
    name: string | null;
    phone: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    vendor_id: string;
    name?: string | null;
    phone?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    vendor_id?: string;
    name?: string | null;
    phone?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};
```

- [ ] **Step 5: Run typecheck and the full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0017_loopkit_vendor_profile.sql test/db/vendor-profile-schema.test.ts src/lib/types.ts
git commit -m "feat: add loopkit.vendors table + vendor-images bucket"
```

---

### Task 2: `src/lib/vendor.ts` — stall name read/write

**Files:**

- Create: `src/lib/vendor.ts`
- Create: `test/lib/vendor.test.ts`

**Interfaces:**

- Produces: `stallNameSchema`, `VendorProfile` type, `getVendorProfile()`,
  `saveStallName(name)`.
- Consumes: `requireVendor()` (`src/lib/auth.ts`), `createServerClient()`
  (`src/lib/supabase/server.ts`), `loopkit.vendors` (Task 1).
- Consumed by: Task 3 (`dashboard/layout.tsx` calls `getVendorProfile()`),
  Task 5 (profile page/form calls both).

- [ ] **Step 1: Write the failing schema tests**

Create `test/lib/vendor.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { stallNameSchema } from "@/lib/vendor";

describe("stallNameSchema", () => {
  it("accepts a valid stall name", () => {
    expect(stallNameSchema.safeParse({ name: "Kopi Corner" }).success).toBe(
      true,
    );
  });

  it("rejects an empty name", () => {
    expect(stallNameSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a whitespace-only name (trims to empty)", () => {
    expect(stallNameSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 60 characters", () => {
    expect(stallNameSchema.safeParse({ name: "a".repeat(61) }).success).toBe(
      false,
    );
  });

  it("accepts a name at exactly 60 characters", () => {
    expect(stallNameSchema.safeParse({ name: "a".repeat(60) }).success).toBe(
      true,
    );
  });
});
```

Run: `pnpm vitest run test/lib/vendor.test.ts`
Expected: FAIL — `src/lib/vendor.ts` doesn't exist yet.

- [ ] **Step 2: Create `src/lib/vendor.ts`**

```typescript
import { z } from "zod";
import { requireVendor } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";

export const stallNameSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export type VendorProfile = {
  name: string | null;
};

// The signed-in vendor's profile row, or a name:null default if they've
// never set one — RLS (vendors_own) scopes this to auth.uid() already, so
// there's nothing to distinguish "not found" from "not theirs."
export async function getVendorProfile(): Promise<VendorProfile> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("vendors").select("name").maybeSingle();
  return { name: data?.name ?? null };
}

export async function saveStallName(name: string): Promise<{ error?: string }> {
  const { user } = await requireVendor();
  const parsed = stallNameSchema.safeParse({ name });
  if (!parsed.success) return { error: "Enter a stall name." };

  const supabase = await createServerClient();
  const { error } = await supabase.from("vendors").upsert(
    {
      vendor_id: user.id,
      name: parsed.data.name,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "vendor_id" },
  );
  if (error) return { error: "Couldn't save your stall name. Try again." };
  return {};
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm vitest run test/lib/vendor.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 4: Add `saveStallName`/`getVendorProfile` mocked-Supabase tests**

Extend `test/lib/vendor.test.ts` (mirror `test/app/save-program-action.test.ts`'s
mocking pattern — `vi.hoisted` + `vi.mock("@/lib/supabase/server", ...)`):

```typescript
import { vi, beforeEach } from "vitest";

const { requireVendorMock } = vi.hoisted(() => ({
  requireVendorMock: vi.fn(async () => ({ user: { id: "vendor-1" } })),
}));
vi.mock("@/lib/auth", () => ({ requireVendor: requireVendorMock }));

const upsertMock = vi.fn(async () => ({ error: null }));
const selectChain = { maybeSingle: vi.fn(async () => ({ data: null })) };
const fromMock = vi.fn(() => ({
  upsert: upsertMock,
  select: () => selectChain,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: fromMock })),
}));

// (import saveStallName/getVendorProfile AFTER the mocks, same ordering
// convention as save-program-action.test.ts)

describe("saveStallName", () => {
  beforeEach(() => {
    upsertMock.mockClear();
  });

  it("upserts the vendor's name on vendor_id conflict", async () => {
    const { saveStallName } = await import("@/lib/vendor");
    const res = await saveStallName("Kopi Corner");
    expect(res.error).toBeUndefined();
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ vendor_id: "vendor-1", name: "Kopi Corner" }),
      { onConflict: "vendor_id" },
    );
  });

  it("returns an error without throwing when Supabase errors", async () => {
    upsertMock.mockResolvedValueOnce({ error: { message: "db down" } });
    const { saveStallName } = await import("@/lib/vendor");
    const res = await saveStallName("Kopi Corner");
    expect(res.error).toMatch(/couldn't save/i);
  });

  it("rejects an invalid name without calling Supabase", async () => {
    const { saveStallName } = await import("@/lib/vendor");
    const res = await saveStallName("");
    expect(res.error).toBeDefined();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("getVendorProfile", () => {
  it("returns name:null when the vendor has no row yet", async () => {
    const { getVendorProfile } = await import("@/lib/vendor");
    const res = await getVendorProfile();
    expect(res).toEqual({ name: null });
  });
});
```

Adjust the mock wiring if `vi.mock` hoisting requires the mocked-module
imports to happen in a separate top-level `import` rather than dynamic
`await import(...)` inside each test — match whatever pattern
`test/app/save-program-action.test.ts` actually uses once you re-check it
during implementation (this step describes intent; follow the repo's real
mocking idiom exactly).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm vitest run test/lib/vendor.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 6: Run typecheck and the full suite**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/vendor.ts test/lib/vendor.test.ts
git commit -m "feat: add getVendorProfile/saveStallName"
```

---

### Task 3: Avatar/initials source — `dashboard-nav.tsx` + `layout.tsx`

**Files:**

- Modify: `src/app/dashboard/dashboard-nav.tsx`
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**

- Consumes: `getVendorProfile()` (Task 2), `user.user_metadata?.avatar_url`
  (Supabase auth user, no schema needed).
- Produces: `DashboardNav` gains two new props, `vendorName: string | null`
  and `avatarUrl: string | null`.

- [ ] **Step 1: Generalize `initials()` from `email` to `label`**

In `src/app/dashboard/dashboard-nav.tsx`, change (currently lines 59-66):

```typescript
/** Up to two initials from an email's local part; falls back to a bullet. */
function initials(email: string): string {
  const local = email.trim().split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
```

to:

```typescript
/**
 * Up to two initials from a label (stall name when set, else the email
 * local part); falls back to a bullet. Splitting on the same separators
 * works for both "Kopi Corner" (space) and "jane.doe" (dot) shapes.
 */
function initials(label: string): string {
  const parts = label
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
```

- [ ] **Step 2: Add `vendorName`/`avatarUrl` props**

Change `DashboardNav`'s props (currently lines 75-87) to add:

```typescript
export function DashboardNav({
  signOut,
  email,
  vendorName,
  avatarUrl,
  tier,
  programs,
  activeByProgramId,
}: {
  signOut: () => Promise<void>;
  email: string;
  vendorName: string | null;
  avatarUrl: string | null;
  tier: Tier;
  programs: Program[];
  activeByProgramId: Record<string, number>;
}) {
```

Add, near the top of the component body: `const label = vendorName?.trim() || email;`

- [ ] **Step 3: Wire the avatar rendering (image branch)**

Change the avatar trigger (currently lines 174-179):

```tsx
<span
  aria-hidden="true"
  className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/12 font-mono text-xs font-semibold tracking-tight text-primary ring-1 ring-inset ring-primary/25"
>
  {initials(email)}
</span>
```

to:

```tsx
<span
  aria-hidden="true"
  className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-primary/12 font-mono text-xs font-semibold tracking-tight text-primary ring-1 ring-inset ring-primary/25"
>
  {avatarUrl ? (
    <Image src={avatarUrl} alt="" fill sizes="2rem" className="object-cover" />
  ) : (
    initials(label)
  )}
</span>
```

Add `import Image from "next/image";` to the top of the file.

- [ ] **Step 4: Wire the dropdown label**

Change the dropdown label block (currently lines 183-190):

```tsx
<DropdownMenuLabel className="px-2 py-2">
  <div className="flex items-center gap-2">
    <p className="truncate text-sm font-semibold">{email}</p>
    <TierBadge tier={tier} />
  </div>
  <p className="text-xs font-normal text-muted-foreground">Vendor account</p>
</DropdownMenuLabel>
```

to:

```tsx
<DropdownMenuLabel className="px-2 py-2">
  <div className="flex items-center gap-2">
    <p className="truncate text-sm font-semibold">{vendorName ?? email}</p>
    <TierBadge tier={tier} />
  </div>
  <p className="text-xs font-normal text-muted-foreground">
    {vendorName ? email : "Vendor account"}
  </p>
</DropdownMenuLabel>
```

- [ ] **Step 5: Wire `layout.tsx`**

In `src/app/dashboard/layout.tsx`, add the `getVendorProfile` fetch
alongside the existing `Promise.all([isPro(), listPrograms()])` (currently
line 20) and pass the two new props into `<DashboardNav>` (currently lines
55-61):

```typescript
import { getVendorProfile } from "@/lib/vendor";
// ...
const [pro, programs, vendorProfile] = await Promise.all([
  isPro(),
  listPrograms(),
  getVendorProfile(),
]);
// ...
<DashboardNav
  signOut={signOut}
  email={user.email ?? ""}
  vendorName={vendorProfile.name}
  avatarUrl={user.user_metadata?.avatar_url ?? null}
  tier={pro ? "pro" : "free"}
  programs={programs}
  activeByProgramId={activeByProgramId}
/>
```

- [ ] **Step 6: Run typecheck and the full test suite**

Run: `pnpm check && pnpm test`
Expected: PASS. (No existing test imports `DashboardNav` directly, so this
is a typecheck-catches-prop-mismatch change, not a test-breaking one.)

- [ ] **Step 7: Manual/visual check**

Start `pnpm dev`, sign in as a vendor with no stall name set — confirm nav
avatar still shows email-derived initials and dropdown still shows email as
the primary line (regression check: behavior must be identical to today
until Task 5 lets a vendor actually set a name).

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/dashboard-nav.tsx src/app/dashboard/layout.tsx
git commit -m "feat: source nav avatar initials + dropdown label from stall name"
```

---

### Task 4: Image upload infra — port `image-resize.ts` + `image-uploader.tsx` from qkit

**Files:**

- Create: `src/lib/image-resize.ts`
- Create: `src/components/image-uploader.tsx`

**Interfaces:**

- Produces: `resizeToWebp(file, maxDim)` (or qkit's exact signature — verify
  when reading the source), an `<ImageUploader>` client component taking a
  `bucket`, `pathPrefix` (vendor id), current `value: string | null`, and
  `onChange: (url: string | null) => void`.
- Consumes: `vendor-images` Storage bucket + RLS policies (Task 1),
  `src/lib/supabase/client.ts`'s `createClient()` (browser client, already
  exists).
- Consumed by: Task 5 (profile form).

- [ ] **Step 1: Read qkit's source in full before porting**

Read `C:\Users\Clarence\Desktop\Coding\qkit\src\lib\image-resize.ts` and
`C:\Users\Clarence\Desktop\Coding\qkit\src\components\image-uploader.tsx`
completely — this plan does not reproduce their exact code (it wasn't in
the researching agent's context verbatim, only summarized: JPEG/PNG/WebP
only, 15 MB source cap, client-side resize to WebP via canvas, target
longest side 1000px for the `thumb` variant, uploads to
`${vendorId}/${crypto.randomUUID()}.${ext}` with `upsert: false`, returns
the public URL via `.getPublicUrl(path)`). Confirm the real implementation
matches this description before porting; if it differs, follow the real
source, not this summary.

- [ ] **Step 2: Port `image-resize.ts` verbatim**

`src/lib/image-resize.ts` — framework-agnostic (canvas/Blob APIs only, no
qkit-specific imports), so this should be a straight copy with no
adjustment needed. If it imports anything qkit-specific, drop only that.

- [ ] **Step 3: Port `image-uploader.tsx`, trimmed to loopkit's needs**

`src/components/image-uploader.tsx` — port the `thumb` variant only (drop
the `banner` variant/prop entirely; loopkit has no banner use case, so
don't carry the unused branch over). Change:

- Bucket: `booth-images` → `vendor-images`.
- Path prefix: qkit's `boothId` equivalent → the signed-in vendor's
  `user.id` (passed in as a prop from the caller, not looked up inside the
  component — keep it a dumb presentational component, same as qkit's).
- Import `createClient` from `@/lib/supabase/client` (loopkit's actual
  browser-client path — qkit's may differ, adjust the import).
- Drop qkit's `MediaImage` wrapper if it doesn't exist in loopkit (it
  doesn't — confirmed during Task 3) — use a plain `next/image` `<Image>`
  for the thumbnail preview instead, same `fill`/`sizes`/`object-cover`
  pattern already used in `dashboard-nav.tsx` (Task 3, Step 3).

- [ ] **Step 4: Manual/visual check**

No automated test for this component (matches this repo's existing
precedent — client-side canvas/Storage-upload interactions aren't unit
tested elsewhere in this codebase either, e.g. `regenOpen` in `/c` isn't
tested). Manually verify: select a JPEG under 15MB, confirm it resizes and
uploads to the `vendor-images` bucket (check Supabase Storage dashboard for
the object at `<vendor-id>/<uuid>.webp`), confirm a >15MB file is rejected
client-side, confirm removing the image clears the preview.

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-resize.ts src/components/image-uploader.tsx
git commit -m "feat: port image-resize + ImageUploader (thumb variant) from qkit"
```

---

### Task 5: Profile page rewrite — identity only, plan/tier removed

**Files:**

- Create: `src/app/dashboard/profile/actions.ts`
- Create: `src/app/dashboard/profile/profile-form.tsx`
- Modify: `src/app/dashboard/profile/page.tsx`
- Create: `test/app/profile-actions.test.ts`

**Interfaces:**

- Consumes: `getVendorProfile()`/`saveStallName()` (Task 2), `ImageUploader`
  (Task 4), `requireVendor()`.
- Produces: `updateStallNameAction`, `updatePasswordAction` (both "use
  server").

- [ ] **Step 1: Write the failing action tests**

Create `test/app/profile-actions.test.ts` (mirror
`test/app/save-program-action.test.ts`'s mocking pattern):

```typescript
import { describe, it, expect, vi } from "vitest";

const { requireVendorMock, saveStallNameMock } = vi.hoisted(() => ({
  requireVendorMock: vi.fn(async () => ({ user: { id: "vendor-1" } })),
  saveStallNameMock: vi.fn(async () => ({})),
}));
vi.mock("@/lib/auth", () => ({ requireVendor: requireVendorMock }));
vi.mock("@/lib/vendor", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/vendor")>();
  return { ...actual, saveStallName: saveStallNameMock };
});

const updateUserMock = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({
    auth: { updateUser: updateUserMock },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  updateStallNameAction,
  updatePasswordAction,
} from "@/app/dashboard/profile/actions";

describe("updateStallNameAction", () => {
  it("delegates to saveStallName", async () => {
    const res = await updateStallNameAction("Kopi Corner");
    expect(saveStallNameMock).toHaveBeenCalledWith("Kopi Corner");
    expect(res.error).toBeUndefined();
  });
});

describe("updatePasswordAction", () => {
  it("calls supabase.auth.updateUser with the new password", async () => {
    const res = await updatePasswordAction("newpassword123");
    expect(updateUserMock).toHaveBeenCalledWith({ password: "newpassword123" });
    expect(res.error).toBeUndefined();
  });

  it("rejects a password under 8 characters without calling Supabase", async () => {
    const res = await updatePasswordAction("short");
    expect(res.error).toBeDefined();
    expect(updateUserMock).not.toHaveBeenCalled();
  });
});
```

Run: `pnpm vitest run test/app/profile-actions.test.ts`
Expected: FAIL — `src/app/dashboard/profile/actions.ts` doesn't exist yet.

- [ ] **Step 2: Create `src/app/dashboard/profile/actions.ts`**

```typescript
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { saveStallName } from "@/lib/vendor";
import { createServerClient } from "@/lib/supabase/server";

export async function updateStallNameAction(
  name: string,
): Promise<{ error?: string }> {
  const res = await saveStallName(name);
  if (!res.error) revalidatePath("/dashboard", "layout");
  return res;
}

const passwordSchema = z.string().min(8).max(72);

export async function updatePasswordAction(
  password: string,
): Promise<{ error?: string }> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: "Use at least 8 characters." };

  const supabase = await createServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: "Couldn't update your password. Try again." };
  return {};
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `pnpm vitest run test/app/profile-actions.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 4: Build `profile-form.tsx`**

Client component, three sections (stall name / photo / password), each an
independently-saved block inside a `Card` (`@/components/ui/card`) — same
save-button-disabled-until-changed pattern as `setup-form.tsx` uses
elsewhere in this codebase (check that file for the exact disabled-state
idiom to match). Stall-name section: `Input` + `updateStallNameAction`.
Photo section: `<ImageUploader bucket="vendor-images" pathPrefix={vendorId}
value={avatarUrl} onChange={...} />` (Task 4) wired to
`supabase.auth.updateUser({ data: { avatar_url: url } })` via the browser
client (`@/lib/supabase/client`) directly — no server action needed for
this piece, matching qkit's pattern where the uploader's `onChange` result
is written straight to user metadata client-side. Password section: two
`Input type="password"` (new + confirm, client-side match check) +
`updatePasswordAction`.

- [ ] **Step 5: Rewrite `page.tsx`**

```typescript
import { requireVendor } from "@/lib/auth";
import { getVendorProfile } from "@/lib/vendor";
import { ProfileForm } from "@/app/dashboard/profile/profile-form";

export default async function ProfilePage() {
  const { user } = await requireVendor();
  const profile = await getVendorProfile();

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-5 py-10">
      <div>
        <h1 className="font-display text-2xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your stall details and account.
        </p>
      </div>
      <ProfileForm
        vendorId={user.id}
        email={user.email ?? ""}
        name={profile.name}
        avatarUrl={user.user_metadata?.avatar_url ?? null}
      />
    </main>
  );
}
```

This removes the entire plan/tier/`ProLock`/card-count block from today's
`page.tsx` (lines 29-62) — that information now lives only on `/plan`. Drop
the now-unused `listPrograms`/`isPro`/`Badge`/`ProLock` imports.

- [ ] **Step 6: Run typecheck and the full suite**

Run: `pnpm check && pnpm test`
Expected: PASS.

- [ ] **Step 7: Manual/visual check**

`pnpm dev` → `/dashboard/profile`: confirm no plan/tier content renders;
set a stall name, confirm it saves and the nav dropdown/avatar update after
a refresh (Task 3's wiring); upload a photo, confirm it replaces the
initials badge; change password, confirm sign-out/sign-in with the new
password works.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/profile/actions.ts src/app/dashboard/profile/profile-form.tsx src/app/dashboard/profile/page.tsx test/app/profile-actions.test.ts
git commit -m "feat: rewrite /profile as pure identity, remove plan/tier duplication"
```

---

### Task 6 (optional — skip unless review flags it missing): `/plan` back-link

**Files:**

- Modify: `src/app/dashboard/plan/page.tsx`

Per the spec: "loopkit's nav dropdown always has a Profile entry, so this
is optional polish, not a gap." Only do this step if, after Task 5 ships,
`/plan` reads as missing an obvious way back to `/profile`.

- [ ] **Step 1 (if needed): add a small link near the tier badge**

```tsx
<Link
  href="/dashboard/profile"
  className="text-xs text-muted-foreground hover:text-foreground"
>
  Profile
</Link>
```

- [ ] **Step 2 (if needed): commit**

```bash
git add src/app/dashboard/plan/page.tsx
git commit -m "polish: add a profile link on /plan"
```
