import { describe, expect, it } from "vitest";
import { hasCapability } from "@/lib/auth/roles";

describe("role capabilities", () => {
  it("lets only admins adjust the built-in synth layouts", () => {
    expect(hasCapability("admin", "adjustBuiltInLayout")).toBe(true);
    expect(hasCapability("user", "adjustBuiltInLayout")).toBe(false);
    expect(hasCapability("guest", "adjustBuiltInLayout")).toBe(false);
  });

  it("lets signed-in users manage their own synths and import or export patches", () => {
    for (const role of ["user", "admin"] as const) {
      expect(hasCapability(role, "manageSynths")).toBe(true);
      expect(hasCapability(role, "importExportPatches")).toBe(true);
    }
    expect(hasCapability("guest", "manageSynths")).toBe(false);
  });
});
