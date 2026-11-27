import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SynthLayoutEditor } from "@/components/synth-editor/SynthLayoutEditor";
import { I18nProvider } from "@/i18n/provider";
import { testLayout } from "../fixtures/instrument";
import { addCategory, closeCategory, openCategory } from "../helpers/categories";

const source = {
  slug: "test-synth",
  displayName: "Test Synth",
  manufacturer: "Test Works",
  revision: 2,
  panelUrl: "/assets/uploads/0f1e2d3c-4b5a-4968-8778-6a5b4c3d2e1f.png",
  layout: testLayout,
};

type SavedBody = {
  categories?: { id: string; name: string; color: string }[];
  controls: { id: string; kind: string; category?: string; selects?: string[]; dependsOn?: string }[];
};

let saved: SavedBody[];

beforeEach(() => {
  saved = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      saved.push(JSON.parse(String(init?.body)) as SavedBody);
      return new Response(JSON.stringify({ ok: true, revision: 3 }), { status: 201 });
    }),
  );
});

function renderEditor() {
  return render(
    <I18nProvider locale="en">
      <SynthLayoutEditor source={source} onSaved={vi.fn()} onClose={vi.fn()} onDeleted={vi.fn()} />
    </I18nProvider>,
  );
}

async function choose(user: ReturnType<typeof userEvent.setup>, field: string, option: string) {
  await user.click(screen.getByRole("combobox", { name: field }));
  await user.click(await screen.findByRole("option", { name: option }));
}

/** Opens every collapsed control group of the editor's control list. */
async function openGroups(user: ReturnType<typeof userEvent.setup>) {
  for (const summary of document.querySelectorAll<HTMLElement>('[id^="controls-"][id$="-header"][aria-expanded="false"]')) {
    await user.click(summary);
  }
}

async function focusControl(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await openGroups(user);
  await user.click(screen.getByRole("button", { name }));
}

async function addTwoCategories(user: ReturnType<typeof userEvent.setup>) {
  await addCategory(user);
  await addCategory(user);
}

const switchOf = (body: SavedBody, id: string) => body.controls.find((control) => control.id === id);

describe("SynthLayoutEditor categories", () => {
  it("adds, recolors and assigns a category and saves it once in the layout", async () => {
    const user = userEvent.setup();
    renderEditor();
    await addTwoCategories(user);
    const dialog = await openCategory(user, "Category 1");
    fireEvent.change(within(dialog).getByLabelText("Colour"), { target: { value: "#ABCDEF" } });
    await closeCategory(user, dialog);
    await focusControl(user, /Test knob · Knob/);
    await choose(user, "Category", "Category 1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    const [first, second] = saved[0]!.categories!;
    expect(first).toMatchObject({ name: "Category 1", color: "#abcdef" });
    expect(second).toMatchObject({ name: "Category 2", color: "#1e88e5" });
    expect(saved[0]!.controls.find((control) => control.kind === "knob")).toMatchObject({ category: first!.id });
  });

  it("sets up a selector with ordered categories and a dependent switch", async () => {
    const user = userEvent.setup();
    renderEditor();
    await addTwoCategories(user);
    await addCategory(user);
    fireEvent.click(screen.getByRole("button", { name: "Add Switch" }));

    await focusControl(user, /Test switch · Switch/);
    await choose(user, "Function", "Selector switch");
    expect(screen.getByText(/1\. Category 1/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Category 2/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add category to the selector" }));
    await user.click(screen.getByRole("button", { name: "Move Category 3 earlier" }));

    await focusControl(user, /Switch 1 · Switch/);
    await choose(user, "Function", "Dependent switch");
    expect(screen.getByRole("combobox", { name: "Depends on" })).toHaveTextContent("Test switch");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    const [one, two, three] = saved[0]!.categories!.map((category) => category.id);
    expect(switchOf(saved[0]!, "Test switch")).toMatchObject({ selects: [one, three, two] });
    const dependent = saved[0]!.controls.find((control) => control.kind === "switch" && control.id !== "Test switch");
    expect(dependent).toMatchObject({ dependsOn: "Test switch" });
  });

  it("lists inconsistent settings on save and corrects them on request", async () => {
    const user = userEvent.setup();
    renderEditor();
    await addTwoCategories(user);
    await focusControl(user, /Test switch · Switch/);
    await choose(user, "Function", "Selector switch");
    await user.click(screen.getByRole("button", { name: "Remove Category 2 from the selector" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const dialog = await screen.findByRole("dialog", { name: "Categories and switches do not fit together" });
    expect(within(dialog).getByText("The selector switch “Test switch” needs at least two categories.")).toBeInTheDocument();
    expect(saved).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Back to the editor" }));
    expect(saved).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Fix and save" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(switchOf(saved[0]!, "Test switch")).not.toHaveProperty("selects");
  });

  it("asks before removing a category that controls use, then clears their references", async () => {
    const user = userEvent.setup();
    renderEditor();
    await addTwoCategories(user);
    await focusControl(user, /Test knob · Knob/);
    await choose(user, "Category", "Category 2");

    await user.click(screen.getByRole("button", { name: "Remove Category 2" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove category?" });
    expect(dialog).toHaveTextContent("“Category 2” is used by 1 control(s).");
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(screen.queryByRole("button", { name: "Edit Category 2" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.controls.find((control) => control.kind === "knob")).not.toHaveProperty("category");
  });

  it("removes an unused category without asking", async () => {
    const user = userEvent.setup();
    renderEditor();
    await addCategory(user);
    await user.click(screen.getByRole("button", { name: "Remove Category 1" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Category 1" })).not.toBeInTheDocument();
  });

  it("blocks saving while a category has no name", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add category" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit category" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Category name" }));
    expect(within(dialog).getByText("Every category needs a name.")).toBeInTheDocument();
    await closeCategory(user, dialog);
    // The list marks the category, and saving waits for a name.
    expect(screen.getByRole("button", { name: "Edit Unnamed" })).toBeInTheDocument();
    expect(screen.getByText("Every category needs a name.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("explains what is missing before a selector or dependent is possible", async () => {
    const user = userEvent.setup();
    renderEditor();
    await focusControl(user, /Test switch · Switch/);
    expect(screen.getByText("Dependent switches need a selector switch first.")).toBeInTheDocument();
    await choose(user, "Function", "Selector switch");
    expect(screen.getByText("Add at least two categories first.")).toHaveAttribute("role", "status");
  });

  it("has no axe violations with categories and a selector", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();
    await addTwoCategories(user);
    await focusControl(user, /Test switch · Switch/);
    await choose(user, "Function", "Selector switch");
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("SynthLayoutEditor LED categories and list dots", () => {
  it("assigns a category to an LED, hides its fixed color and saves the category", async () => {
    const user = userEvent.setup();
    renderEditor();
    await addTwoCategories(user);
    await focusControl(user, /Test LED · LED/);
    expect(screen.getByRole("combobox", { name: "Colour" })).toBeInTheDocument();
    await choose(user, "Category", "Category 2");
    expect(screen.queryByRole("combobox", { name: "Colour" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saved).toHaveLength(1));
    const second = saved[0]!.categories![1]!.id;
    expect(saved[0]!.controls.find((control) => control.kind === "led")).toMatchObject({ category: second });
  });

  it("shows the categories of each control as dots in the control list", async () => {
    const user = userEvent.setup();
    renderEditor();
    await addTwoCategories(user);
    await focusControl(user, /Test knob · Knob/);
    await choose(user, "Category", "Category 1");
    await focusControl(user, /Test switch · Switch/);
    await choose(user, "Function", "Selector switch");

    await openGroups(user);
    const dotsOf = (name: RegExp) =>
      [...screen.getByRole("button", { name }).querySelectorAll("[data-category-dot]")].map((dot) => dot.getAttribute("data-category-dot"));
    expect(dotsOf(/Test knob · Knob/)).toHaveLength(1);
    expect(dotsOf(/Test switch · Switch/)).toHaveLength(2);
    expect(dotsOf(/Test LED · LED/)).toHaveLength(0);
  });
});

describe("SynthLayoutEditor fixed color dots", () => {
  it("shows plain switches and LEDs without category in their own color, and the category once assigned", async () => {
    const user = userEvent.setup();
    renderEditor();
    await openGroups(user);
    const fixedOf = (name: RegExp) => screen.getByRole("button", { name }).querySelector("[data-fixed-color]")?.getAttribute("data-fixed-color");
    expect(fixedOf(/Test switch · Switch/)).toBe("var(--color-switch-stroke)");
    expect(fixedOf(/Test LED · LED/)).toBe("var(--color-led-red)");
    expect(fixedOf(/Test knob · Knob/)).toBe("var(--color-knob-tick)");

    await addTwoCategories(user);
    await focusControl(user, /Test LED · LED/);
    await choose(user, "Category", "Category 1");
    expect(fixedOf(/Test LED · LED/)).toBeUndefined();
    expect(screen.getByRole("button", { name: /Test LED · LED/ }).querySelectorAll("[data-category-dot]")).toHaveLength(1);
  });
});

