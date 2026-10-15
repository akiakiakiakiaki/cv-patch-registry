import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InstrumentArtwork } from "@/components/instrument-artwork/InstrumentArtwork";

describe("InstrumentArtwork", () => {
  it("renders uploaded panels as an image, never inline", () => {
    const { container } = render(
      <InstrumentArtwork className="art" src="/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.svg" label="Panel" aspectRatio="800 / 400" />,
    );
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.svg");
    expect(image).toHaveAttribute("alt", "Panel");
    expect(container.querySelector("svg")).toBeNull();
  });

  it("keeps the inline path for bundled project assets", () => {
    const { container } = render(<InstrumentArtwork className="art" src="/proton.svg" label="Proton" aspectRatio="2048 / 650" />);
    expect(container.querySelector("img")).toBeNull();
  });
});
