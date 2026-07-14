# Nav Dropdown Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder loopkit's account dropdown from `Plan → Settings → Profile` to `Profile → Settings → Plan`, matching the identity-first convention established in this session's cross-kit nav research.

**Architecture:** Single-file JSX reorder in `DashboardNav`, plus a test update asserting the new order. This is loopkit's half of a cross-kit standardization (qkit's half is a separate, deferred plan in the qkit repo — do not touch qkit here).

**Tech Stack:** Next.js 16, TypeScript strict, Tailwind v4, shadcn/ui, Vitest + Testing Library (jsdom), pnpm.

## Global Constraints

- Every commit must leave `pnpm check` (prettier + eslint + tsc) clean.
- Pure reorder only — no label, icon, href, or behavior change to any of the 3 items (`Plan` keeps its `Wallet` icon and `/dashboard/plan` href, `Settings` keeps `Settings` icon and `/dashboard/settings`, `Profile` keeps `User` icon and `/dashboard/profile`).
- The top-level `LINKS` array (`Dashboard`, `Customers`, `Activity`, `Stats` inline nav links) is untouched — this task only affects the account dropdown.

---

### Task 1: Reorder the account dropdown items

**Files:**

- Modify: `src/app/dashboard/dashboard-nav.tsx`
- Modify: `src/app/dashboard/dashboard-nav.dom.test.tsx`

**Interfaces:**

- No exported signature change — `DashboardNav`'s props are unchanged.

- [ ] **Step 1: Write the failing test**

In `src/app/dashboard/dashboard-nav.dom.test.tsx`, replace the existing test (currently titled `"account menu has Plan, Settings, Profile, Sign out, and no separate Customers item"`, lines 67-82) with:

```tsx
it("account menu has Profile, Settings, Plan, Sign out (in that order), and no separate Customers item", async () => {
  const user = userEvent.setup();
  render(<DashboardNav {...baseProps} />);
  const accountButton = screen.getByRole("button", {
    name: /account menu/i,
  });
  await user.click(accountButton);

  const dropdownLinks = screen
    .getAllByRole("menuitem")
    .filter((l) =>
      ["Profile", "Settings", "Plan"].includes(l.textContent ?? ""),
    );
  expect(dropdownLinks.map((l) => l.textContent)).toEqual([
    "Profile",
    "Settings",
    "Plan",
  ]);
  expect(screen.getByText("Sign out")).toBeInTheDocument();
  // "Customers" appears exactly once — the inline nav link (asserted by
  // role "link" above) — proving the account-dropdown item was removed,
  // not merely hidden.
  expect(screen.getAllByText("Customers")).toHaveLength(1);
});
```

(This replaces the previous test's four separate `getByText` presence checks for Plan/Settings/Profile/Sign out with a single order-sensitive assertion for the three reorderable items, plus keeps the existing Sign-out-presence and Customers-count assertions unchanged.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test dashboard-nav.dom.test.tsx`
Expected: FAIL — `dropdownLinks.map((l) => l.textContent)` currently evaluates to `["Plan", "Settings", "Profile"]`, not `["Profile", "Settings", "Plan"]`.

- [ ] **Step 3: Reorder the JSX**

In `src/app/dashboard/dashboard-nav.tsx`, the three `DropdownMenuItem` blocks (right after the `<DropdownMenuSeparator />` that follows `<DropdownMenuLabel>`, right before the `<DropdownMenuSeparator />` that precedes the Sign-out form) currently read:

```tsx
            <DropdownMenuItem asChild>
              <Link href="/dashboard/plan" className="cursor-pointer">
                <Wallet className="size-4" />
                Plan
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="cursor-pointer">
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" className="cursor-pointer">
                <User className="size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
```

Replace with the same three blocks in the new order (Profile first, Plan last — content of each block is byte-identical, only their sequence changes):

```tsx
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" className="cursor-pointer">
                <User className="size-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="cursor-pointer">
                <Settings className="size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/plan" className="cursor-pointer">
                <Wallet className="size-4" />
                Plan
              </Link>
            </DropdownMenuItem>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test dashboard-nav.dom.test.tsx`
Expected: PASS (all 5 tests in the file)

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `pnpm check && pnpm test`
Expected: All pass.

- [ ] **Step 6: Manually verify in the running app**

Run: `pnpm dev`, sign in, open the account dropdown (avatar, top right). Confirm the order reads Profile, Settings, Plan, then a separator, then Sign out.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/dashboard-nav.tsx src/app/dashboard/dashboard-nav.dom.test.tsx
git commit -m "fix(nav): reorder account dropdown to Profile, Settings, Plan"
```
