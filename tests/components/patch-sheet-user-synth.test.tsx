import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatchSheet } from "@/components/patch-sheet/PatchSheet";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import { testLayout } from "../fixtures/instrument";

// Regression: a user synth (not the built-in Proton) used to loop with "Maximum update depth exceeded".
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("synth=custom-synth"),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { useSession: () => ({ data: null, isPending: false }), signOut: vi.fn() },
}));

const view = {
  slug: "custom-synth",
  displayName: "Custom Synth",
  manufacturer: null,
  revision: 1,
  isBuiltIn: false,
  ownerId: null,
  layout: testLayout,
  panelUrl: "/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png",
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/synths/custom-synth")) return new Response(JSON.stringify(view), { status: 200 });
      if (url.startsWith("/api/synths")) return new Response(JSON.stringify({ synths: [{ slug: "custom-synth", displayName: "Custom Synth", isBuiltIn: false }] }), { status: 200 });
      return new Response("{}", { status: 404 });
    }),
  );
});

describe("PatchSheet with a user synth", () => {
  it("renders the selected synth without update loops", async () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      render(
        <I18nProvider locale="en">
          <PatchSheet />
        </I18nProvider>,
      );
      await waitFor(() => expect(screen.getByRole("region", { name: /Custom Synth/ })).toBeInTheDocument());
      // React reports update loops from effects with a delay, so give them time to show up.
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      console.error = original;
    }
    expect(errors.map(String).join("\n")).not.toContain("Maximum update depth");
  });
});

describe("palette drag feedback", () => {
  it("previews the control shape and selects the control placed by dropping", async () => {
    const { container } = render(
      <I18nProvider locale="en">
        <SynthLayoutEditor
          source={{ slug: "ghost", displayName: "Ghost", manufacturer: null, revision: 1, panelUrl: "/x.png", layout: testLayout }}
          onSaved={vi.fn()}
          onClose={vi.fn()}
          onDeleted={vi.fn()}
        />
      </I18nProvider>,
    );
    const svg = container.querySelector('svg[viewBox="0 0 1000 600"]');
    expect(svg).not.toBeNull();
    vi.spyOn(svg!, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 510,
      bottom: 320,
      width: 500,
      height: 300,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(screen.getByRole("button", { name: "Add Switch" }), { clientX: 50, clientY: 60, pointerId: 3 });
    fireEvent.pointerMove(window, { clientX: 260, clientY: 170, pointerId: 3 });
    const preview = container.querySelector('rect[aria-hidden="true"]');
    expect(preview).not.toBeNull();
    expect(Number(preview?.getAttribute("x"))).toBeCloseTo(500 - testLayout.geometry.switch.width / 2);

    fireEvent.pointerUp(window, { clientX: 260, clientY: 170, pointerId: 3 });
    expect(await screen.findByRole("button", { name: /Switch 1 · Switch/ })).toBeInTheDocument();
    await waitFor(() => expect(container.ownerDocument.activeElement).toHaveAttribute("data-layout-element-kind", "switch"));
  });
});

describe("instrument selector before the catalog loads", () => {
  it("offers the selected synth so MUI does not warn about an out-of-range value", async () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
    try {
      render(
        <I18nProvider locale="en">
          <PatchSheet />
        </I18nProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      console.warn = original;
    }
    expect(warnings.join("\n")).not.toContain("out-of-range");
  });
});
