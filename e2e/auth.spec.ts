import { expect, test } from "./test";

test.describe("accounts", () => {
  test("someone registers, is welcomed, and signs out through the user menu", async ({ page }) => {
    const email = `new-${Date.now()}@e2e.test`;
    await page.goto("/register");
    await page.getByRole("textbox", { name: "Name" }).fill("Nora New");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill("nora-password-1");
    await page.getByRole("button", { name: "Create account" }).click();

    const welcome = page.getByRole("dialog", { name: "Welcome aboard!" });
    await expect(welcome).toBeVisible();
    await welcome.getByRole("button", { name: "Get started" }).click();
    await expect(welcome).toBeHidden();

    await page.getByRole("button", { name: "Nora New" }).hover();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nora New" })).toBeHidden();
  });

  test("a wrong password is refused with a message", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email" }).fill("member@e2e.test");
    await page.getByRole("textbox", { name: "Password" }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
