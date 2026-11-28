import type { Locator, Page } from "@playwright/test";

async function centerOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("The element is not visible, so it cannot be dragged.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Presses the pointer on `from` and releases it on `to`, moving in steps like a hand would. */
export async function dragOnto(page: Page, from: Locator, to: Locator) {
  const start = await centerOf(from);
  const end = await centerOf(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

/** Presses the pointer on `target` and moves it by (dx, dy) pixels before releasing. */
export async function dragBy(page: Page, target: Locator, dx: number, dy: number) {
  const start = await centerOf(target);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 10 });
  await page.mouse.up();
}
