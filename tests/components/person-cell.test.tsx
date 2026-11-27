import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersonCell } from "@/components/admin/PersonCell";
import { I18nProvider } from "@/i18n/provider";
import { translate } from "@/i18n/messages";
import { personName } from "@/lib/users/person";

function renderCell(person: { name: string; email: string; deleted: boolean }) {
  return render(
    <I18nProvider locale="en">
      <PersonCell person={person} />
    </I18nProvider>,
  );
}

describe("accounts in admin lists", () => {
  it("show name and email address", () => {
    renderCell({ name: "Ada", email: "ada@example.test", deleted: false });
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("ada@example.test")).toBeInTheDocument();
  });

  it("show a deleted account as such, without its cleared address", () => {
    const { container } = renderCell({ name: "", email: "deleted-u1@deleted.invalid", deleted: true });
    expect(container).toHaveTextContent("Deleted user");
    expect(container).not.toHaveTextContent("deleted.invalid");
  });

  it("name a deleted account the same way in text", () => {
    const t = (key: Parameters<typeof translate>[1]) => translate("en", key);
    expect(personName(t, { name: "", deleted: true })).toBe("Deleted user");
    expect(personName(t, { name: "Ada", deleted: false })).toBe("Ada");
  });
});
