import { describe, expect, it } from "vitest";
import { cx } from "@/lib/utils/class-names";
import { formatTimestamp } from "@/lib/utils/date-format";

describe("cx", () => {
  it("joins only the truthy class names", () => {
    expect(cx("a", false, null, undefined, "", "b")).toBe("a b");
    expect(cx()).toBe("");
  });
});

describe("formatTimestamp", () => {
  const value = "2026-11-26T15:30:00.000Z";
  it("formats per locale, medium by default and short on request", () => {
    expect(formatTimestamp(value, "en")).toBe(new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)));
    expect(formatTimestamp(value, "de", "short")).toBe(new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)));
  });
  it("names unknown times in the user's language", () => {
    expect(formatTimestamp("nonsense", "de")).toBe("Zeit unbekannt");
    expect(formatTimestamp("nonsense", "en")).toBe("Unknown time");
  });
});
