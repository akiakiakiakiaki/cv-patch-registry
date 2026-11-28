import { expect, test as setup } from "./test";
import { E2E_ACCOUNTS, signedInState, type E2eAccount } from "./accounts";

/** Signs every test account in once through the real form and saves its cookies for the tests. */
for (const name of Object.keys(E2E_ACCOUNTS) as E2eAccount[]) {
  setup(`sign in as ${name}`, async ({ page }) => {
    const person = E2E_ACCOUNTS[name];
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email" }).fill(person.email);
    await page.getByRole("textbox", { name: "Password" }).fill(person.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: person.name })).toBeVisible();
    await page.context().storageState({ path: signedInState(name) });
  });
}
