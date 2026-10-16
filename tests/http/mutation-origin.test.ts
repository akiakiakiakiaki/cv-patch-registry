import { describe, expect, it } from "vitest";
import { rejectCrossOriginMutation } from "@/lib/http/mutation-origin";

describe("rejectCrossOriginMutation", () => {
  it("accepts same-origin browser mutations", () => {
    const request = new Request("https://app.example/api/patches", { method: "POST", headers: { origin: "https://app.example" } });
    expect(rejectCrossOriginMutation(request)).toBeNull();
  });

  it("rejects cross-origin and opaque origins", () => {
    for (const origin of ["https://attacker.example", "null"]) {
      const request = new Request("https://app.example/api/patches", { method: "POST", headers: { origin } });
      expect(rejectCrossOriginMutation(request)?.status).toBe(403);
    }
  });

  it("allows requests without an Origin header for non-browser clients", () => {
    const request = new Request("http://localhost/api/patches", { method: "POST" });
    expect(rejectCrossOriginMutation(request)).toBeNull();
  });
});
