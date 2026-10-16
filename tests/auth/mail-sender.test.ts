import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleMailSender, getMailSender } from "@/lib/auth/mail-sender";

afterEach(() => vi.unstubAllEnvs());

describe("mail sender selection", () => {
  it("uses the console sender outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getMailSender()).toBeInstanceOf(ConsoleMailSender);
  });

  it("never logs credential links through the console sender in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getMailSender()).toThrow("Email delivery is not configured for production");
  });
});
