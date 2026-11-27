import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { PatchAdminList } from "@/components/admin/PatchAdminList";
import { I18nProvider } from "@/i18n/provider";
import type { PatchGroup } from "@/lib/patches/patch-admin";

const patch = (id: string, extra: Partial<PatchGroup["patches"][number]> = {}) => ({
  id,
  name: `Patch ${id}`,
  owner: { name: "Ada", email: "ada@example.test", deleted: false },
  visibility: "public",
  tagLabels: [],
  hasSample: false,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-27T10:00:00.000Z",
  revision: 3,
  synthRevision: 22,
  ...extra,
});

const groups: PatchGroup[] = [
  { synth: { slug: "behringer-proton", displayName: "Behringer Proton", deleted: false, currentRevision: 1 }, patches: [patch("legacy")] },
  {
    synth: { slug: "td3", displayName: "TD3", deleted: false, currentRevision: 22 },
    patches: [patch("a", { tagLabels: ["Acid", "Bass"], hasSample: true }), patch("b", { synthRevision: 14, visibility: "private", owner: { name: "Bob", email: "bob@example.test", deleted: false } })],
  },
];

function renderList() {
  return render(
    <I18nProvider locale="en">
      <PatchAdminList groups={groups} />
    </I18nProvider>,
  );
}

describe("patch overview", () => {
  it("counts the patches and names synths like everywhere, legacy marked", () => {
    renderList();
    expect(screen.getByRole("status")).toHaveTextContent("3 patch(es) on 2 synth(s).");
    expect(screen.getByRole("button", { name: /Behringer Proton \(Legacy\) \(1\)/ })).toBeInTheDocument();
  });

  it("shows each patch with owner, visibility, tags, sample, dates and an outdated synth revision", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /TD3 \(2\)/ }));
    const a = document.querySelector('[data-patch="a"]') as HTMLElement;
    expect(within(a).getByRole("link", { name: "Patch a" })).toHaveAttribute("href", "/?synth=td3&patch=a");
    expect(a).toHaveTextContent("Acid, Bass");
    expect(within(a).getByLabelText("Has a sample")).toBeInTheDocument();
    expect(a).toHaveTextContent("created");
    const b = document.querySelector('[data-patch="b"]') as HTMLElement;
    expect(b).toHaveTextContent("bob@example.test");
    expect(b).toHaveTextContent("private");
    expect(within(b).getByText("14 of 22")).toBeInTheDocument();
    expect(within(a).queryByText(/of 22/)).not.toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderList();
    expect(await axe(container)).toHaveNoViolations();
  });
});
