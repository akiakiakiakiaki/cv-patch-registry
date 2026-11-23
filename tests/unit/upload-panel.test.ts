import { describe, expect, it } from "vitest";
import { panelRejectionMessage } from "@/components/synth-editor/upload-panel";
import { translate } from "@/i18n/messages";
import type { MessageKey, MessageValues } from "@/i18n/messages";

const t = (key: MessageKey, values?: MessageValues) => translate("en", key, values);

describe("panelRejectionMessage", () => {
  it("explains a full quota in its own words", () => {
    expect(panelRejectionMessage("quota", t)).toBe(
      "Your panel storage is full (at most 50 panels or 50 MB). Delete synths you no longer need and try again.",
    );
  });

  it("names other rejection reasons", () => {
    expect(panelRejectionMessage("unsupported-type", t)).toBe("The panel was rejected (unsupported-type).");
  });
});
