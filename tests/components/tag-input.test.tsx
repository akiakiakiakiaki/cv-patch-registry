import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TagInput, addTags } from "@/components/patch-sheet/TagInput";
import { I18nProvider } from "@/i18n/provider";
import { MAX_TAGS_PER_PATCH } from "@/lib/domain/tags";

const known = [
  { slug: "fx", label: "FX" },
  { slug: "acid", label: "Acid" },
  { slug: "acid house", label: "Acid house" },
];

describe("addTags", () => {
  it("uses the known spelling, starts new tags uppercase and skips duplicates", () => {
    expect(addTags(["Acid"], ["fx", "tb-303", "ACID", "TB-303"], known)).toEqual({ tags: ["Acid", "FX", "Tb-303"], invalid: [], tooMany: false });
  });

  it("reports invalid entries and the limit", () => {
    const full = Array.from({ length: MAX_TAGS_PER_PATCH }, (_, index) => `Tag ${index}`);
    expect(addTags(full, ["one more"], known)).toMatchObject({ tags: full, tooMany: true });
    expect(addTags([], ["bad!", "  "], known)).toEqual({ tags: [], invalid: ["bad!"], tooMany: false });
  });
});

let queries: string[];

beforeEach(() => {
  queries = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const query = new URL(String(input), "http://localhost").searchParams.get("q") ?? "";
      queries.push(query);
      return new Response(JSON.stringify({ tags: known.filter((tag) => tag.slug.includes(query.toLowerCase())) }), { status: 200 });
    }),
  );
});

function Harness({ initial = [] as string[], onChange = vi.fn() }) {
  const [tags, setTags] = useState(initial);
  return (
    <I18nProvider locale="en">
      <TagInput
        value={tags}
        onChange={(next) => {
          onChange(next);
          setTags(next);
        }}
      />
    </I18nProvider>
  );
}

const chips = () => screen.queryAllByRole("button").filter((element) => element.classList.contains("MuiChip-root")).map((chip) => chip.textContent);

describe("TagInput", () => {
  it("suggests existing tags while typing and turns a chosen one into a chip", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByRole("combobox", { name: "Tags" }), "aci");
    const listbox = await screen.findByRole("listbox");
    await waitFor(() => expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual(["Acid", "Acid house"]));
    expect(queries).toContain("aci");
    await user.click(within(listbox).getByRole("option", { name: "Acid house" }));
    expect(onChange).toHaveBeenLastCalledWith(["Acid house"]);
    expect(chips()).toEqual(["Acid house"]);
    expect(screen.getByRole("combobox", { name: "Tags" })).toHaveValue("");
  });

  it("makes a chip from typed text on Enter or comma, starting uppercase", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const field = screen.getByRole("combobox", { name: "Tags" });
    await user.type(field, "dark pad{Enter}");
    await user.type(field, "TB-303,noise");
    expect(chips()).toEqual(["Dark pad", "TB-303"]);
    expect(field).toHaveValue("noise");
    expect(onChange).toHaveBeenLastCalledWith(["Dark pad", "TB-303"]);
  });

  it("keeps the known spelling of an existing tag", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const field = screen.getByRole("combobox", { name: "Tags" });
    await user.type(field, "fx");
    await screen.findByRole("option", { name: "FX" });
    await user.keyboard("{Enter}");
    expect(chips()).toEqual(["FX"]);
  });

  it("removes a chip and leaves out already chosen tags from the suggestions", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={["Acid"]} onChange={onChange} />);
    await user.type(screen.getByRole("combobox", { name: "Tags" }), "aci");
    const listbox = await screen.findByRole("listbox");
    await waitFor(() => expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual(["Acid house"]));
    await user.keyboard("{Escape}");
    const chip = screen.getAllByRole("button").find((element) => element.textContent === "Acid")!;
    await user.click(within(chip).getByTestId("CancelIcon"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("explains invalid tags and the limit", async () => {
    const user = userEvent.setup();
    render(<Harness initial={Array.from({ length: MAX_TAGS_PER_PATCH - 1 }, (_, index) => `Tag ${index}`)} />);
    const field = screen.getByRole("combobox", { name: "Tags" });
    await user.type(field, "bad!{Enter}");
    expect(screen.getByText(/“bad!” is not a valid tag/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, "last{Enter}");
    await user.type(field, "too many{Enter}");
    expect(screen.getByText("At most 10 tags per patch.")).toBeInTheDocument();
    expect(chips()).toHaveLength(MAX_TAGS_PER_PATCH);
  });
});

describe("TagInput accessibility", () => {
  it("has no axe violations with chips", async () => {
    const { container } = render(<Harness initial={["Acid", "TB-303"]} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

