import { describe, expect, it } from "vitest";
import { translate } from "@/i18n/messages";
import { LEGACY_PROTON_SLUG, PROTON_CLONE_SLUG } from "@/lib/adapters/proton-legacy-migration-adapter";
import { isLegacySynth, synthName } from "@/lib/synths/synth-name";

const t = (key: Parameters<typeof translate>[1], values?: Parameters<typeof translate>[2]) => translate("en", key, values);

describe("synthName", () => {
  it("marks legacy synths and leaves every other name as it is", () => {
    expect(isLegacySynth(LEGACY_PROTON_SLUG)).toBe(true);
    expect(synthName(t, { slug: LEGACY_PROTON_SLUG, displayName: "Behringer Proton" })).toBe("Behringer Proton (Legacy)");
    expect(synthName(t, { slug: PROTON_CLONE_SLUG, displayName: "Behringer Proton" })).toBe("Behringer Proton");
    expect(synthName(t, { slug: "td3", displayName: "TD3" })).toBe("TD3");
  });
});
