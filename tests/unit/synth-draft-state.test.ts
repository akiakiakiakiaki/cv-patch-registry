import { describe, expect, it } from "vitest";
import { addControl, clampToPanel, controlsFromLayout, removeControl, updateControl } from "@/components/synth-editor/draft-state";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

const bounds = { width: 100, height: 50 };

describe("editor draft state", () => {
  it("adds controls with generated IDs and automatic labels per kind", () => {
    const once = addControl([], "knob", { x: 10.2, y: 20.8 }, bounds);
    const twice = addControl(once, "knob", { x: 30, y: 40 }, bounds);
    expect(twice.map((control) => control.label)).toEqual(["Knob 1", "Knob 2"]);
    expect(twice[0]).toMatchObject({ kind: "knob", x: 10, y: 21 });
    expect(twice[0]!.id).toMatch(/^knob-[a-f0-9]{8}$/);
    expect(new Set(twice.map((control) => control.id)).size).toBe(2);
  });

  it("snaps to half units and keeps positions inside the panel", () => {
    expect(clampToPanel({ x: 10.26, y: 10.74 }, bounds)).toEqual({ x: 10.5, y: 10.5 });
    expect(clampToPanel({ x: 250, y: -3 }, bounds)).toEqual({ x: 100, y: 0 });
  });

  it("gives LEDs a default color", () => {
    expect(addControl([], "led", { x: 1, y: 1 }, bounds)[0]).toMatchObject({ kind: "led", color: "red" });
  });

  it("renames and moves a control without changing its ID", () => {
    const [control] = addControl([], "in", { x: 5, y: 5 }, bounds);
    const [updated] = updateControl([control!], control!.id, { label: "Audio in", x: 99.3, y: 7 }, bounds);
    expect(updated).toMatchObject({ id: control!.id, label: "Audio in", x: 99.5, y: 7 });
  });

  it("removes a control by ID only", () => {
    const controls = addControl(addControl([], "switch", { x: 1, y: 1 }, bounds), "switch", { x: 2, y: 2 }, bounds);
    expect(removeControl(controls, controls[0]!.id)).toHaveLength(1);
  });

  it("loads controls from a stored layout, falling back to the ID as label", () => {
    const controls = controlsFromLayout(behringerProton.layout);
    expect(controls.find((control) => control.id === "Tune 1")).toMatchObject({ kind: "knob", label: "Tune 1" });
    expect(controls.filter((control) => control.kind === "in").length).toBe(behringerProton.layout.ports.filter((port) => port.kind === "in").length);
  });
});
