import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import { layoutElementKindOf } from "@/lib/domain/control-ids";
import type { InstrumentLayout } from "@/lib/instrument/layout";
import { testLayout } from "../fixtures/instrument";

// jsdom has no SVG coordinate system: the pointer maps 1:1 to panel units.
beforeAll(() => {
  Object.defineProperty(SVGSVGElement.prototype, "createSVGPoint", {
    configurable: true,
    value: () => {
      const point = { x: 0, y: 0, matrixTransform: () => ({ x: point.x, y: point.y }) };
      return point;
    },
  });
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", { configurable: true, value: () => ({ inverse: () => ({}) }) });
  Element.prototype.setPointerCapture = vi.fn();
});

const CAT = "cat-0000aaaa";
const layout: InstrumentLayout = {
  ...testLayout,
  categories: [{ id: CAT, name: "Filter", color: "#43a047" }],
  switches: [{ id: "switch-0000aaaa", label: "Drive", x: 200, y: 100, style: "slide", category: CAT }],
};

let saved: Array<{ controls: Array<Record<string, unknown>> }> = [];

function renderEditor() {
  saved = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      saved.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ revision: 2 }), { status: 201 });
    }),
  );
  return render(
    <I18nProvider locale="en">
      <SynthLayoutEditor source={{ slug: "copy", displayName: "Copy", manufacturer: null, revision: 1, panelUrl: "/x.png", layout }} onSaved={vi.fn()} onClose={vi.fn()} onDeleted={vi.fn()} />
    </I18nProvider>,
  );
}

const shortcut = (key: string) => fireEvent.keyDown(document.body, { key, metaKey: true });
const drives = () => [...document.querySelectorAll('[data-layout-element-kind="switch"]')];
const position = (element: Element) => {
  const width = Number(element.getAttribute("width"));
  const height = Number(element.getAttribute("height"));
  return { x: Number(element.getAttribute("x")) + width / 2, y: Number(element.getAttribute("y")) + height / 2 };
};

async function focusDrive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Switches (1)" }));
  await user.click(screen.getByRole("button", { name: /Drive · Slide switch/ }));
}

describe("copying and pasting controls", () => {
  it("pastes a copy with all settings at the pointer and focuses it", async () => {
    const user = userEvent.setup();
    renderEditor();
    await focusDrive(user);
    shortcut("c");
    fireEvent.pointerMove(window, { clientX: 500, clientY: 300 });
    shortcut("v");

    expect(drives()).toHaveLength(2);
    expect(position(drives()[1]!)).toEqual({ x: 500, y: 300 });
    expect(screen.getByRole("spinbutton", { name: "X" })).toHaveValue(500);
    await user.click(screen.getByRole("button", { name: "Save" }));
    const [original, copy] = saved[0]!.controls.filter((control) => control.kind === "switch");
    expect(copy).toMatchObject({ kind: "switch", label: "Drive", style: "slide", category: CAT, x: 500, y: 300 });
    expect(copy!.id).not.toBe(original!.id);
    expect(String(copy!.id)).toMatch(/^switch-[a-f0-9]{8}$/);
  });

  it("pastes next to the original when the pointer is not over the panel, a step further each time", async () => {
    const user = userEvent.setup();
    renderEditor();
    await focusDrive(user);
    shortcut("c");
    fireEvent.pointerMove(window, { clientX: 5000, clientY: 5000 });
    shortcut("v");
    shortcut("v");
    expect(drives().slice(1).map(position)).toEqual([
      { x: 210, y: 110 },
      { x: 220, y: 120 },
    ]);
  });

  it("can be undone, and still pastes after the original was removed", async () => {
    const user = userEvent.setup();
    renderEditor();
    await focusDrive(user);
    shortcut("c");
    shortcut("v");
    expect(drives()).toHaveLength(2);
    fireEvent.keyDown(document.body, { key: "z", metaKey: true });
    expect(drives()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Remove Drive" }));
    expect(drives()).toHaveLength(0);
    shortcut("v");
    expect(drives()).toHaveLength(1);
  });

  it("does nothing without a copy, and leaves text fields their own copy and paste", async () => {
    const user = userEvent.setup();
    renderEditor();
    shortcut("v");
    expect(drives()).toHaveLength(1);
    await focusDrive(user);
    const label = screen.getByRole("textbox", { name: "Label" });
    fireEvent.keyDown(label, { key: "c", metaKey: true });
    fireEvent.keyDown(label, { key: "v", metaKey: true });
    expect(drives()).toHaveLength(1);
  });
});

describe("layoutElementKindOf", () => {
  it("keeps knobs, switches and LEDs and draws every port as a port", () => {
    expect(["knob", "switch", "led", "in", "out", "uni"].map((kind) => layoutElementKindOf(kind as never))).toEqual(["knob", "switch", "led", "port", "port", "port"]);
  });
});
