import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import { testLayout } from "../fixtures/instrument";

const source = {
  slug: "test-synth",
  displayName: "Test Synth",
  manufacturer: "Test Works",
  revision: 2,
  panelUrl: "/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png",
  layout: testLayout,
};

function renderEditor(onSaved = vi.fn(), onClose = vi.fn()) {
  return render(
    <I18nProvider locale="en">
      <SynthLayoutEditor source={source} onSaved={onSaved} onClose={onClose} onDeleted={vi.fn()} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("SynthLayoutEditor", () => {
  it("adds a control from the palette with the next automatic label", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add Knob" }));
    expect(screen.getByRole("button", { name: /Knob 1 · Knob/ })).toBeInTheDocument();
  });

  it("renames the focused control and removes it again", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: /Test knob · Knob/ }));
    const label = screen.getByRole("textbox", { name: "Label" });
    await user.clear(label);
    await user.type(label, "Cutoff");
    expect(screen.getByRole("button", { name: /Cutoff · Knob/ })).toBeInTheDocument();
    const aside = screen.getByRole("complementary");
    await user.click(within(aside).getAllByRole("button", { name: "Remove Cutoff" })[0]!);
    expect(screen.queryByRole("button", { name: /Cutoff · Knob/ })).not.toBeInTheDocument();
  });

  it("saves a new revision with the revision it was based on", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, revision: 3 }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    renderEditor(onSaved);

    fireEvent.click(screen.getByRole("button", { name: "Add Switch" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/synths/test-synth/revisions");
    expect(JSON.parse(String(request.body))).toMatchObject({ expectedRevision: 2, displayName: "Test Synth" });
    expect(screen.getByRole("status")).toHaveTextContent("Saved. New revision created.");
  });

  it("reports a conflict when another revision was saved meanwhile", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "conflict" }), { status: 409 })));
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Add Switch" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed in the meantime");
  });

  it("has no axe violations", async () => {
    const { container } = renderEditor();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("SynthLayoutEditor deletion", () => {
  it("asks for confirmation and deletes the synth", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onDeleted = vi.fn();
    render(
      <I18nProvider locale="en">
        <SynthLayoutEditor source={source} onSaved={vi.fn()} onClose={vi.fn()} onDeleted={onDeleted} />
      </I18nProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Delete synth" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/synths/test-synth", { method: "DELETE" });
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

});
