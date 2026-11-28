import { test as base } from "@playwright/test";

export { expect } from "@playwright/test";

let nextClient = 0;

/**
 * Every test comes from its own client address. The app limits sign-ins per address (3 in 10 s, see Better Auth's
 * rate limit); one shared address would let the tests trip over that limit instead of testing the app.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    nextClient += 1;
    await use({ "x-forwarded-for": `10.0.${Math.floor(nextClient / 250)}.${(nextClient % 250) + 1}` });
  },
});
