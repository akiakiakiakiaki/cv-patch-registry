import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SampleSection } from "@/components/patch-editor/SampleSection";
import { I18nProvider } from "@/i18n/provider";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const sample = { url: "/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.mp3", title: "Sub drone", license: "CC BY 4.0" };

function renderSection(props: { sample: typeof sample | null; isOwner: boolean }) {
  return render(
    <I18nProvider locale="en">
      <SampleSection patchId="patch-1" {...props} />
    </I18nProvider>,
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_FEATURE_AUDIO = "true";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_FEATURE_AUDIO;
});

describe("SampleSection", () => {
  it("renders nothing while audio is disabled", () => {
    delete process.env.NEXT_PUBLIC_FEATURE_AUDIO;
    const { container } = renderSection({ sample, isOwner: true });
    expect(container).toBeEmptyDOMElement();
  });

  it("plays the sample without preloading the file", () => {
    const { container } = renderSection({ sample, isOwner: false });
    const audio = container.querySelector("audio");
    expect(audio).toHaveAttribute("src", sample.url);
    expect(audio).toHaveAttribute("preload", "none");
    expect(screen.queryByRole("button", { name: "Upload sample" })).not.toBeInTheDocument();
  });

  it("offers the upload form to the owner only while no sample exists", () => {
    renderSection({ sample: null, isOwner: true });
    expect(screen.getByRole("button", { name: "Upload sample" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("has no axe violations", async () => {
    const { container } = renderSection({ sample: null, isOwner: true });
    expect(await axe(container)).toHaveNoViolations();
  });
});
