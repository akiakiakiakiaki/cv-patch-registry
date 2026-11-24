import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_HEADER_HEIGHT_VARIABLE, AppHeader } from "@/components/app-shell/AppHeader";
import { I18nProvider } from "@/i18n/provider";

vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }), signOut: vi.fn() },
}));

afterEach(() => {
  document.documentElement.style.removeProperty(APP_HEADER_HEIGHT_VARIABLE);
  vi.unstubAllGlobals();
});

describe("AppHeader", () => {
  it("publishes its height and updates it when the header resizes", () => {
    let resize: (() => void) | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    let height = 64;
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => height });
    try {
      render(
        <I18nProvider locale="en">
          <AppHeader />
        </I18nProvider>,
      );
      expect(document.documentElement.style.getPropertyValue(APP_HEADER_HEIGHT_VARIABLE)).toBe("64px");
      height = 112;
      resize?.();
      expect(document.documentElement.style.getPropertyValue(APP_HEADER_HEIGHT_VARIABLE)).toBe("112px");
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
    }
  });
});
