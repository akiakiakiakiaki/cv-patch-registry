import { screen, waitFor, within } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import { expect } from "vitest";

type User = ReturnType<typeof userEvent.setup>;

/** Opens the edit dialog of a category from the editor's category list. */
export async function openCategory(user: User, name: string): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: `Edit ${name}` }));
  return screen.findByRole("dialog", { name: "Edit category" });
}

/** Closes the category dialog with "Done". */
export async function closeCategory(user: User, dialog: HTMLElement): Promise<void> {
  await user.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit category" })).not.toBeInTheDocument());
}

/** Adds a category with its default name and color; its dialog opens on adding and is closed again. */
export async function addCategory(user: User): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Add category" }));
  await closeCategory(user, await screen.findByRole("dialog", { name: "Edit category" }));
}
