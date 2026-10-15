import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFsStorage } from "@/lib/storage/local-fs-storage";

let root: string;
let temporary: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "panel-uploads-"));
  temporary = mkdtempSync(path.join(tmpdir(), "panel-tmp-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(temporary, { recursive: true, force: true });
});

describe("LocalFsStorage", () => {
  it("writes under a generated key and returns only that key", async () => {
    const storage = new LocalFsStorage(root, temporary);
    const key = await storage.put(new Uint8Array([1, 2, 3]), "png");
    expect(key).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(readFileSync(path.join(root, key))).toEqual(Buffer.from([1, 2, 3]));
    expect(existsSync(path.join(temporary, key))).toBe(false);
  });

  it("derives the public URL from the key", async () => {
    const storage = new LocalFsStorage(root, temporary);
    const key = await storage.put(new Uint8Array([0]), "svg");
    expect(storage.publicUrl(key)).toBe(`/assets/uploads/${key}`);
  });

  it("removes a stored file and ignores foreign keys", async () => {
    const storage = new LocalFsStorage(root, temporary);
    const key = await storage.put(new Uint8Array([9]), "jpg");
    await storage.remove(key);
    expect(existsSync(path.join(root, key))).toBe(false);
    await expect(storage.remove("../package.json")).resolves.toBeUndefined();
  });

  it("refuses to build a URL for an invalid key", () => {
    expect(() => new LocalFsStorage(root, temporary).publicUrl("../etc/passwd")).toThrow("Invalid storage key");
  });
});
