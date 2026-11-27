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
  it("reads stored bytes back and refuses invalid keys", async () => {
    const storage = new LocalFsStorage(root, temporary);
    const key = await storage.put(new Uint8Array([4, 5, 6]), "mp3");
    expect(await storage.read(key)).toEqual(new Uint8Array([4, 5, 6]));
    await expect(storage.read("../secret.png")).rejects.toThrow("Invalid storage key");
  });

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

describe("LocalFsStorage for backups", () => {
  it("stores bytes under a given key, replacing a file already there", async () => {
    const storage = new LocalFsStorage(root, temporary);
    const key = "0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png";
    await storage.putAt(key, new Uint8Array([1]));
    await storage.putAt(key, new Uint8Array([2, 3]));
    expect(readFileSync(path.join(root, key))).toEqual(Buffer.from([2, 3]));
    await expect(storage.putAt("../escape.png", new Uint8Array([1]))).rejects.toThrow("Invalid storage key");
  });

  it("lets the browser upload through the app", async () => {
    const storage = new LocalFsStorage(root, temporary);
    expect(await storage.uploadTarget("0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png")).toEqual({
      url: "/api/admin/backup/files/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png",
      method: "PUT",
      headers: {},
    });
  });
});
