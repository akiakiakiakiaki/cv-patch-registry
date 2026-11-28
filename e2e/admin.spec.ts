import { expect, test } from "./test";
import { signedInState } from "./accounts";

test.describe("as a member", () => {
  test.use({ storageState: signedInState("member") });

  test("there is no admin area", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Uwe User" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
    const response = await page.goto("/admin/users");
    expect(response?.status()).toBe(404);
  });
});

test.describe("as an admin", () => {
  test.use({ storageState: signedInState("admin") });

  test("the admin area lists the accounts", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Admin" }).click();
    await expect(page).toHaveURL(/\/admin\/synths/);
    await page.getByRole("link", { name: "Users" }).click();
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(page.getByText("member@e2e.test")).toBeVisible();
  });
});
