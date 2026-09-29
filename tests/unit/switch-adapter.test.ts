import { describe, expect, it } from "vitest";
import { protonSwitchAdapter } from "@/lib/instruments/behringer-proton/switch-adapter";

describe("Proton switch adapter", () => {
  it("keeps Shift active and toggles the selected color channel", () => {
    expect(protonSwitchAdapter.getState({}, "Shift")).toEqual({
      active: true,
      color: "red",
      stateKey: "Shift::blue",
    });
    expect(protonSwitchAdapter.toggle({}, "Shift")).toEqual({
      id: "Shift::blue",
      value: true,
    });
    expect(protonSwitchAdapter.getState({ "Shift::blue": true }, "Shift")).toMatchObject({
      active: true,
      color: "blue",
    });
    expect(protonSwitchAdapter.toggle({ "Shift::blue": true }, "Shift")).toEqual({
      id: "Shift::blue",
      value: false,
    });
  });

  it("maintains independent red and blue values for dual-channel switches", () => {
    const redUpdate = protonSwitchAdapter.toggle({}, "1 shot");
    expect(redUpdate).toEqual({ id: "1 shot", value: true });

    const blueSwitches = { "Shift::blue": true, "1 shot": true };
    expect(protonSwitchAdapter.getState(blueSwitches, "1 shot")).toMatchObject({
      active: false,
      color: "blue",
      stateKey: "1 shot::blue",
    });
    expect(protonSwitchAdapter.toggle(blueSwitches, "1 shot")).toEqual({
      id: "1 shot::blue",
      value: true,
    });
  });

  it("uses blue styling and a shared state for ordinary switches", () => {
    expect(protonSwitchAdapter.getState({}, "Mode 1")).toEqual({
      active: false,
      color: "blue",
      stateKey: "Mode 1",
    });
  });
});
