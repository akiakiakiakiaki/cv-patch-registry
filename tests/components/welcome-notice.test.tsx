import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { WELCOME_PATH, WelcomeNotice } from "@/components/welcome/WelcomeNotice";
import { I18nProvider } from "@/i18n/provider";

function arriveAt(path: string) {
  window.history.replaceState(null, "", path);
  return render(
    <I18nProvider locale="en">
      <WelcomeNotice />
    </I18nProvider>,
  );
}

afterEach(() => window.history.replaceState(null, "", "/"));

describe("welcome notice", () => {
  it("greets a new account once and clears the marker from the address", async () => {
    const user = userEvent.setup();
    const { container } = arriveAt(`${WELCOME_PATH}&synth=proton`);
    const dialog = await screen.findByRole("dialog", { name: "Welcome aboard!" });
    expect(dialog).toHaveTextContent("You can get started now");
    expect(window.location.search).toBe("?synth=proton");
    expect(await axe(container.ownerDocument.body)).toHaveNoViolations();
    await user.click(within(dialog).getByRole("button", { name: "Get started" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("stays hidden on a normal visit", () => {
    arriveAt("/");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says when the confirmation link did not work, instead of welcoming", async () => {
    arriveAt(`${WELCOME_PATH}&error=TOKEN_EXPIRED`);
    const dialog = await screen.findByRole("dialog", { name: "Confirmation failed" });
    expect(dialog).toHaveTextContent("expired or is invalid");
    expect(within(dialog).getByRole("link", { name: "Go to sign-in" })).toHaveAttribute("href", "/login");
    expect(window.location.search).toBe("");
  });
});
