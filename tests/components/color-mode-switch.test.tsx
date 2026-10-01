import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "@/components/app-providers/AppProviders";
import { ColorModeSwitch } from "@/components/color-mode-switch/ColorModeSwitch";
import { I18nProvider } from "@/i18n/provider";

describe("ColorModeSwitch", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it("uses the system theme initially and persists a user override", async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <I18nProvider locale="en">
          <ColorModeSwitch />
        </I18nProvider>
      </AppProviders>,
    );

    const switchButton = await screen.findByRole("button", { name: "Switch to dark theme" });
    await user.click(switchButton);

    await waitFor(() => {
      expect(window.localStorage.getItem("cv-patch-registry-color-mode")).toBe("dark");
    });
    expect(await screen.findByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});
