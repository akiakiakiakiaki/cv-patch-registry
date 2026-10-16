import { describe, expect, it } from "vitest";
import { readJsonLimited } from "@/lib/http/read-json-limited";

describe("readJsonLimited", () => {
  it("parses JSON that fits within the byte limit", async () => {
    const request = new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ name: "Patch" }) });
    await expect(readJsonLimited(request, 100)).resolves.toEqual({ ok: true, value: { name: "Patch" } });
  });

  it("rejects bodies that exceed the byte limit", async () => {
    const request = new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ name: "A much longer patch name" }) });
    await expect(readJsonLimited(request, 10)).resolves.toEqual({ ok: false, reason: "too-large" });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("http://localhost/api", { method: "POST", body: "{invalid" });
    await expect(readJsonLimited(request, 100)).resolves.toEqual({ ok: false, reason: "invalid" });
  });
});
