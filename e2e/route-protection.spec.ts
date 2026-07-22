import { test, expect } from "@playwright/test";

// Unauthenticated route-protection: like smoke.spec.ts, runnable with only
// `pnpm dev` + `playwright install` — no Supabase provisioning. Middleware's
// getUser() makes no network call without a session cookie (resolves
// user:null locally), so these redirects/gates fire without a live DB.
test.describe("signed-out route protection", () => {
  for (const path of ["/dashboard", "/dashboard/customers", "/setup"]) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    });
  }

  test("/admin 404s rather than revealing the route exists", async ({
    page,
  }) => {
    const response = await page.goto("/admin");
    expect(response?.status()).toBe(404);
  });
});

// Public, anonymous customer-facing flows — no auth, no required query param
// means no DB call is attempted, so these render deterministically too.
test.describe("public flows without a valid link", () => {
  test("/c without ?v= prompts for the shop's link instead of a form", async ({
    page,
  }) => {
    await page.goto("/c");
    await expect(
      page.getByText("Ask the shop for their loyalty link."),
    ).toBeVisible();
  });

  test("/earn without ?order= shows a missing-reference message", async ({
    page,
  }) => {
    await page.goto("/earn");
    await expect(page.getByText("Missing order reference.")).toBeVisible();
  });
});
