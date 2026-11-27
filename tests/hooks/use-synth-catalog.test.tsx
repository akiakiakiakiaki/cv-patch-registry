import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSynthCatalog } from "@/hooks/use-synth-catalog";
import { I18nProvider } from "@/i18n/provider";

afterEach(() => vi.unstubAllGlobals());

const wrapper = ({ children }: { children: ReactNode }) => <I18nProvider locale="en">{children}</I18nProvider>;

describe("synth catalog", () => {
  it("marks the user's own synths that await approval in the selector", async () => {
    const catalog = {
      synths: [
        { slug: "td3", displayName: "TD3", isBuiltIn: false, approved: true },
        { slug: "fresh", displayName: "Fresh Synth", isBuiltIn: false, approved: false },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(String(input) === "/api/synths" ? catalog : {}), { status: String(input) === "/api/synths" ? 200 : 404 })));
    const { result } = renderHook(() => useSynthCatalog("td3"), { wrapper });
    await waitFor(() => expect(result.current.instrumentOptions).toHaveLength(2));
    expect(result.current.instrumentOptions.map((option) => option.displayName)).toEqual(["TD3", "Fresh Synth (awaiting approval)"]);
  });
});
