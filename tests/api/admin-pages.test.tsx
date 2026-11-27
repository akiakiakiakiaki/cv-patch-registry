// @vitest-environment node
import { isValidElement } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ user: null as { id: string; role: string } | null }));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => session.user }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

beforeAll(async () => {
  process.env.PATCH_DB_DIR = "memory://";
  const { serverDatabase } = await import("@/lib/db/server");
  await serverDatabase();
});

const layout = async () => (await import("@/app/admin/layout")).default({ children: "content" });
const synthsPage = async () => (await import("@/app/admin/synths/page")).default();
const usersPage = async () => (await import("@/app/admin/users/page")).default();
const samplesPage = async () => (await import("@/app/admin/samples/page")).default();
const backupPage = async () => (await import("@/app/admin/backup/page")).default();
const patchesPage = async () => (await import("@/app/admin/patches/page")).default();

describe("admin area", () => {
  it.each([
    ["visitors", null],
    ["users", { id: "u", role: "user" }],
  ])("does not exist for %s", async (_who, user) => {
    session.user = user;
    await expect(layout()).rejects.toThrow("NOT_FOUND");
    // The pages check on their own too, in case they are ever rendered without the layout.
    await expect(synthsPage()).rejects.toThrow("NOT_FOUND");
    await expect(usersPage()).rejects.toThrow("NOT_FOUND");
    await expect(samplesPage()).rejects.toThrow("NOT_FOUND");
    await expect(backupPage()).rejects.toThrow("NOT_FOUND");
    await expect(patchesPage()).rejects.toThrow("NOT_FOUND");
  });

  it.each([
    ["admins", { id: "a", role: "admin" }],
    ["the owner", { id: "o", role: "owner" }],
  ])("opens for %s, with the synth management first", async (_who, user) => {
    session.user = user;
    expect(isValidElement(await layout())).toBe(true);
    expect(isValidElement(await synthsPage())).toBe(true);
    expect(isValidElement(await usersPage())).toBe(true);
    expect(isValidElement(await samplesPage())).toBe(true);
    expect(isValidElement(await backupPage())).toBe(true);
    expect(isValidElement(await patchesPage())).toBe(true);
    await expect((async () => (await import("@/app/admin/page")).default())()).rejects.toThrow("REDIRECT /admin/synths");
  });
});
