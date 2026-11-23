import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("SampleSection upload errors", () => {
  beforeEach(() => {
    // jsdom cannot decode audio: report a 5 s duration for every file.
    vi.stubGlobal(
      "Audio",
      class {
        duration = 5;
        preload = "";
        onloadedmetadata: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onloadedmetadata?.());
        }
      },
    );
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = () => {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function submitWith(response: Response | Error) {
    vi.stubGlobal("fetch", vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }));
    const user = userEvent.setup();
    renderSection({ sample: null, isOwner: true });
    await user.upload(screen.getByLabelText(/MP3 or M4A file/), new File(["data"], "take.mp3", { type: "audio/mpeg" }));
    await user.type(screen.getByRole("textbox", { name: /Sample title/ }), "Take");
    await user.type(screen.getByRole("textbox", { name: /License/ }), "CC BY 4.0");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Upload sample" }));
    return screen.findByRole("alert");
  }

  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });

  it.each([
    ["unsupported-type", 422, "The file is neither MP3 nor M4A. The type is detected from the content, not the file extension."],
    ["quota", 422, "Your storage is full (50 MB for panels and samples)."],
    ["invalid", 422, "Enter a title and a license and confirm the rights."],
    ["too-large", 413, "The file is too large (maximum 1.5 MB)."],
    ["sample-exists", 409, "This patch already has a sample."],
    ["disabled", 404, "Audio samples are currently not enabled."],
    ["not-found", 404, "The patch was not found. Reload the page and try again."],
    ["unauthorized", 401, "Please sign in again."],
  ])("explains the server error %s", async (error, status, message) => {
    expect(await submitWith(json({ error }, status))).toHaveTextContent(message);
  });

  it("falls back to a general message for unknown errors and network failures, and frees the button", async () => {
    expect(await submitWith(new Error("offline"))).toHaveTextContent("The sample could not be uploaded. Please try again.");
    expect(screen.getByRole("button", { name: "Upload sample" })).toBeEnabled();
  });
});

describe("SampleSection replacing a sample", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "Audio",
      class {
        duration = 5;
        preload = "";
        onloadedmetadata: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onloadedmetadata?.());
        }
      },
    );
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = () => {};
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers replacing to the owner only", () => {
    renderSection({ sample, isOwner: false });
    expect(screen.queryByRole("button", { name: "Replace sample" })).not.toBeInTheDocument();
  });

  it("prefills title and license, asks for the rights again and sends replace=true", async () => {
    const stored = { url: "/assets/uploads/1a2b3c4d-4b5a-4968-8778-6a5b4c3d2e1f.m4a", title: "New take", license: "CC BY 4.0" };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, sample: stored }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <I18nProvider locale="en">
        <SampleSection patchId="patch-1" sample={sample} isOwner onChange={onChange} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Replace sample" }));
    expect(screen.getByRole("textbox", { name: /Sample title/ })).toHaveValue("Sub drone");
    expect(screen.getByRole("textbox", { name: /License/ })).toHaveValue("CC BY 4.0");
    expect(screen.getByRole("checkbox")).not.toBeChecked();

    await user.upload(screen.getByLabelText(/MP3 or M4A file/), new File(["data"], "take.m4a", { type: "audio/mp4" }));
    await user.clear(screen.getByRole("textbox", { name: /Sample title/ }));
    await user.type(screen.getByRole("textbox", { name: /Sample title/ }), "New take");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Replace sample" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Sample replaced.");
    const url = new URL(String(fetchMock.mock.calls[0]![0]), "http://localhost");
    expect(Object.fromEntries(url.searchParams)).toEqual({ title: "New take", license: "CC BY 4.0", rights: "true", replace: "true" });
    expect(onChange).toHaveBeenCalledWith(stored);
  });

  it("closes the form again on cancel without uploading", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderSection({ sample, isOwner: true });
    await user.click(screen.getByRole("button", { name: "Replace sample" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace sample" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a first upload to the caller as well", async () => {
    const stored = { url: "/assets/uploads/1a2b3c4d-4b5a-4968-8778-6a5b4c3d2e1f.mp3", title: "Take", license: "CC BY 4.0" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, sample: stored }), { status: 201 })));
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <I18nProvider locale="en">
        <SampleSection patchId="patch-1" sample={null} isOwner onChange={onChange} />
      </I18nProvider>,
    );
    await user.upload(screen.getByLabelText(/MP3 or M4A file/), new File(["data"], "take.mp3", { type: "audio/mpeg" }));
    await user.type(screen.getByRole("textbox", { name: /Sample title/ }), "Take");
    await user.type(screen.getByRole("textbox", { name: /License/ }), "CC BY 4.0");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Upload sample" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Sample uploaded.");
    expect(onChange).toHaveBeenCalledWith(stored);
  });
});
