import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { describe, expect, it } from "vitest";
import { SampleAdminList } from "@/components/admin/SampleAdminList";
import { I18nProvider } from "@/i18n/provider";
import type { SampleGroup } from "@/lib/samples/sample-admin";

const file = (id: string, extra: Partial<SampleGroup["samples"][number]> = {}) => ({
  assetId: id,
  url: `/assets/uploads/${id}.mp3`,
  byteSize: 1_572_864,
  createdAt: "2026-11-27T10:00:00.000Z",
  uploader: { name: "Ada", email: "ada@example.test", deleted: false },
  sample: { title: `Take ${id}`, license: "CC0" },
  patch: { id: `patch-${id}`, name: `Patch ${id}`, visibility: "public", owner: { name: "Ada", deleted: false } },
  ...extra,
});

const groups: SampleGroup[] = [
  { synth: null, samples: [file("orphan", { sample: null, patch: null })] },
  { synth: { slug: "td3", displayName: "TD3", deleted: false }, samples: [file("a"), file("b", { patch: { id: "patch-b", name: "Patch b", visibility: "private", owner: { name: "Bob", deleted: false } } })] },
];

function renderList(list: SampleGroup[] = groups) {
  return render(
    <I18nProvider locale="en">
      <SampleAdminList groups={list} />
    </I18nProvider>,
  );
}

describe("sample overview", () => {
  it("opens with the unused files, marked as removable, and counts them", () => {
    renderList();
    expect(screen.getByRole("status")).toHaveTextContent("1 sample file(s) not used by any patch.");
    const unusedRow = document.querySelector('[data-sample="orphan"]') as HTMLElement;
    expect(unusedRow).toHaveAttribute("data-used", "false");
    expect(within(unusedRow).getByLabelText("Not used by any patch – can potentially be removed")).toBeInTheDocument();
    expect(within(unusedRow).getByText("No patch")).toBeInTheDocument();
    expect(within(unusedRow).getByText("Untitled file")).toBeInTheDocument();
  });

  it("shows each synth's samples with their patch, its owner and visibility", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /TD3 \(2\)/ }));
    const row = document.querySelector('[data-sample="b"]') as HTMLElement;
    expect(within(row).getByRole("link", { name: "Patch b" })).toHaveAttribute("href", "/?synth=td3&patch=patch-b");
    expect(row).toHaveTextContent("Bob · private");
    expect(row).toHaveTextContent("1.50 MB");
    expect(within(row).getByLabelText("Used by a patch")).toBeInTheDocument();
  });

  it("says when nothing is unused or uploaded", () => {
    const { unmount } = renderList([groups[1]!]);
    expect(screen.getByRole("status")).toHaveTextContent("Every sample file is used by a patch.");
    unmount();
    renderList([]);
    expect(screen.getByText("No samples uploaded yet.")).toBeInTheDocument();
  });

  it("tells the legacy synth from its successor of the same name", () => {
    renderList([
      { synth: { slug: "behringer-proton", displayName: "Behringer Proton", deleted: false }, samples: [file("old")] },
      { synth: { slug: "behringer-proton-v2", displayName: "Behringer Proton", deleted: false }, samples: [file("new")] },
    ]);
    expect(screen.getByRole("button", { name: /Behringer Proton \(Legacy\) \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Behringer Proton \(1\)/ })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderList();
    expect(await axe(container)).toHaveNoViolations();
  });
});
