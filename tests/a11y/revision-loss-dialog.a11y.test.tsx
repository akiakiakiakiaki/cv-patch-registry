import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/confirm-dialog/ConfirmDialog";
import { RevisionLossDetails } from "@/components/patch-sheet/RevisionLossDetails";
import { I18nProvider } from "@/i18n/provider";

const prompt = {
  patchName: "Testpatch",
  fromRevision: 5,
  toRevision: 7,
  losses: [
    { kind: "knob" as const, id: "knob-00000001", label: "Cutoff", value: 91 },
    { kind: "switch" as const, id: "switch-00000001", label: "Start / Stop", value: true },
    { kind: "cable" as const, id: "out-1:in-1", label: "VCO Out → Filter In" },
  ],
};

describe("revision loss dialog", () => {
  it("on save: names patch, revisions, each lost setting and all three choices, without axe violations", async () => {
    render(
      <I18nProvider locale="de">
        <ConfirmDialog
          open
          tone="warning"
          title="Einige Einstellungen passen nicht mehr"
          content={<RevisionLossDetails prompt={prompt} synthName="Behringer TD3" mode="save" />}
          confirmLabel="Speichern"
          alternativeLabel="Alten Zustand wiederherstellen"
          cancelLabel="Abbrechen"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
          onAlternative={vi.fn()}
        />
      </I18nProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Einige Einstellungen passen nicht mehr" });
    expect(dialog).toHaveTextContent("„Testpatch“ wurde mit Revision 5 von Behringer TD3 gespeichert");
    expect(dialog).toHaveTextContent("Regler „Cutoff“");
    expect(dialog).toHaveTextContent("Wert 91");
    expect(dialog).toHaveTextContent("Schalter „Start / Stop“");
    expect(dialog).toHaveTextContent("Patchkabel „VCO Out → Filter In“");
    expect(dialog).toHaveTextContent("du arbeitest in Revision 5 weiter");
    for (const name of ["Speichern", "Alten Zustand wiederherstellen", "Abbrechen"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(await axe(document.body)).toHaveNoViolations();
  });

  it("on upgrade: says the settings must be set again manually, without axe violations", async () => {
    render(
      <I18nProvider locale="de">
        <ConfirmDialog
          open
          tone="warning"
          title="Patch auf Revision 7 aktualisieren?"
          content={<RevisionLossDetails prompt={prompt} synthName="Behringer TD3" mode="upgrade" />}
          confirmLabel="Aktualisieren"
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    );
    const dialog = screen.getByRole("dialog", { name: "Patch auf Revision 7 aktualisieren?" });
    expect(dialog).toHaveTextContent("Revision 7 von Behringer TD3 hat für diese Einstellungen von „Testpatch“ kein Bedienelement mehr");
    expect(dialog).toHaveTextContent("manuell neu");
    expect(await axe(document.body)).toHaveNoViolations();
  });
});
