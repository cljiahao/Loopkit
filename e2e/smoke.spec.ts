import { test, expect } from "@playwright/test";

// Public smoke: the app boots and the marketing + auth pages render without any
// Supabase provisioning. Runnable with only `pnpm dev` + `playwright install`.
test("landing renders", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /Turn one-time buyers into regulars/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Get started" }).first(),
  ).toBeVisible();
});

test("login renders", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: /Continue with Google/ }),
  ).toBeVisible();
});
