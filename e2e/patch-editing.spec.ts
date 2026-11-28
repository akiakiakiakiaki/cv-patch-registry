import type { Page } from "@playwright/test";
import { expect, test } from "./test";
import { signedInState } from "./accounts";
import { dragBy, dragOnto } from "./drag";

/** The round end of a plugged cable; drawn in the SVG with a label but without a role. */
function cableEnd(page: Page, port: string) {
  return page.locator(`[aria-label="Drag cable end at ${port}"]`);
}

test.use({ storageState: signedInState("member") });

test("a patch made with knobs, a cable and a switch is still there after reloading", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New patch" }).click();
  const name = page.getByRole("textbox", { name: "Active patch name" });
  await name.fill("E2E Acid");

  const knob = page.getByRole("slider", { name: "Tune 1" });
  const before = Number(await knob.getAttribute("aria-valuenow"));
  await dragBy(page, knob, 0, -40);
  await expect(knob).not.toHaveAttribute("aria-valuenow", String(before));
  const turned = await knob.getAttribute("aria-valuenow");
  expect(Number(turned)).toBeGreaterThan(before);

  await dragOnto(page, page.getByRole("button", { name: "Output OSC1" }), page.getByRole("button", { name: "Input VCF1 IN" }));
  await expect(cableEnd(page, "VCF1 IN")).toBeVisible();
  await expect(page.getByText(/· 1 cables ·/)).toBeVisible();

  const sync = page.getByRole("button", { name: "Sync", exact: true });
  const syncWasOn = (await sync.getAttribute("aria-pressed")) === "true";
  await sync.click();
  await expect(sync).toHaveAttribute("aria-pressed", String(!syncWasOn));

  await expect(page.getByRole("status")).toHaveText("Saved to your account");
  await page.reload();

  await expect(name).toHaveValue("E2E Acid");
  await expect(knob).toHaveAttribute("aria-valuenow", turned!);
  await expect(cableEnd(page, "VCF1 IN")).toBeVisible();
  await expect(sync).toHaveAttribute("aria-pressed", String(!syncWasOn));
});

test("dragging a cable end away from every port removes the cable", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New patch" }).click();
  await dragOnto(page, page.getByRole("button", { name: "Output LFO1 UNI" }), page.getByRole("button", { name: "Input PW1" }));
  const end = cableEnd(page, "PW1");
  await expect(end).toBeVisible();
  await dragBy(page, end, 0, -400);
  await expect(end).toBeHidden();
  await expect(page.getByText(/· 0 cables ·/)).toBeVisible();
});
