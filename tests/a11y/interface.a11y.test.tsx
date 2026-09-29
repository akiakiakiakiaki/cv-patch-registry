import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { InstrumentPanel } from "@/components/instrument-panel/InstrumentPanel";
import { PatchManager } from "@/components/patch-manager/PatchManager";
import { I18nProvider } from "@/i18n/provider";
import type { PatchData, PatchRecord } from "@/lib/domain/types";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";
import { testInstrument, testLayout } from "../fixtures/instrument";

const patch: PatchRecord = {
  id: "patch-a11y",
  name: "Accessible patch",
  updatedAt: "2026-01-01T00:00:00.000Z",
  data: { knobs: {}, switches: {}, leds: {}, cables: [] },
};

describe("interface accessibility", () => {
  it("has no axe violations in the patch manager", async () => {
    const { container } = render(
      <I18nProvider locale="en">
        <PatchManager
          instruments={[behringerProton]}
          instrumentId={behringerProton.id}
          onInstrumentChange={vi.fn()}
          patches={[patch]}
          activeId={patch.id}
          activeName={patch.name}
          status="Saved"
          onNameChange={vi.fn()}
          onSelect={vi.fn()}
          onCreate={vi.fn()}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          onExport={vi.fn()}
          onImport={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("exposes named and stateful instrument controls without axe violations", async () => {
    const data: PatchData = {
      knobs: { "Test knob": 42 },
      switches: { "Test switch": true },
      leds: { "Test LED": true },
      cables: [],
    };
    const { container, getByRole } = render(
      <I18nProvider locale="en">
        <InstrumentPanel
          data={data}
          instrument={testInstrument}
          layout={testLayout}
          layoutEditMode={false}
          focusedElement={null}
          onFocusLayoutElement={vi.fn()}
          onClearLayoutFocus={vi.fn()}
          onMoveFocusedLayoutElement={vi.fn()}
          onKnobChange={vi.fn()}
          onSwitchChange={vi.fn()}
          onLedChange={vi.fn()}
          onCableChange={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(getByRole("slider", { name: "Test knob" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
    expect(getByRole("button", { name: "Test switch" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(getByRole("checkbox", { name: "Test LED" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
