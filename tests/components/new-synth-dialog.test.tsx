import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NewSynthDialog, slugify } from "@/components/synth-editor/NewSynthDialog";
import { I18nProvider } from "@/i18n/provider";

describe("slugify", () => {
  it("builds a URL identifier from the display name", () => {
    expect(slugify("  Mein Synth Ünit #2 ")).toBe("mein-synth-unit-2");
    expect(slugify("!!!")).toBe("");
  });
});

describe("NewSynthDialog", () => {
  it("uploads the panel, creates the synth and reports its slug", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ panel: { id: "asset-1", url: "/assets/uploads/x.png", width: 800, height: 400 } }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, slug: "my-synth", revision: 1 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();

    render(
      <I18nProvider locale="en">
        <NewSynthDialog open onClose={vi.fn()} onCreated={onCreated} />
      </I18nProvider>,
    );

    await user.type(screen.getByRole("textbox", { name: /Name/ }), "My Synth");
    expect(screen.getByRole("textbox", { name: /Identifier/ })).toHaveValue("my-synth");
    const file = new File([new Uint8Array([0x89])], "panel.png", { type: "image/png" });
    await user.upload(document.getElementById("new-synth-panel") as HTMLInputElement, file);
    await user.click(screen.getByRole("button", { name: "Create synth" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("my-synth"));
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1].body))).toMatchObject({ panelAssetId: "asset-1", controls: [] });
    vi.unstubAllGlobals();
  });

  it("shows the server reason when the identifier is taken", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ panel: { id: "a", url: "/x.png", width: 1, height: 1 } }), { status: 201 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: "slug-taken" }), { status: 409 })),
    );
    render(
      <I18nProvider locale="en">
        <NewSynthDialog open onClose={vi.fn()} onCreated={vi.fn()} />
      </I18nProvider>,
    );
    await user.type(screen.getByRole("textbox", { name: /Name/ }), "Taken");
    await user.upload(document.getElementById("new-synth-panel") as HTMLInputElement, new File([new Uint8Array([1])], "p.png", { type: "image/png" }));
    await user.click(screen.getByRole("button", { name: "Create synth" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already taken");
    vi.unstubAllGlobals();
  });
});
