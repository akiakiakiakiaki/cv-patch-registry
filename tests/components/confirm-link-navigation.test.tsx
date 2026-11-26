import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLeaveGuard } from "@/lib/navigation/leave-guard";
import { useConfirmLinkNavigation } from "@/lib/navigation/use-confirm-link-navigation";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function Links({ active }: { active: boolean }) {
  useConfirmLinkNavigation(active);
  return (
    <>
      <a href="/explore?tag=acid">Explore</a>
      <a href="https://example.com/">External</a>
      <a href="/explore" target="_blank">New tab</a>
      <a href={`${window.location.pathname}#top`}>Same page</a>
    </>
  );
}

const click = (name: string, init: MouseEventInit = {}) => {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  screen.getByRole("link", { name }).dispatchEvent(event);
  return event.defaultPrevented;
};

let removeGuard: () => void = () => {};
beforeEach(() => router.push.mockClear());
afterEach(() => removeGuard());

describe("useConfirmLinkNavigation", () => {
  it("asks before following an in-app link and navigates only when leaving is fine", async () => {
    let answer = false;
    removeGuard = setLeaveGuard(async () => answer);
    render(<Links active />);
    expect(click("Explore")).toBe(true);
    await Promise.resolve();
    expect(router.push).not.toHaveBeenCalled();

    answer = true;
    click("Explore");
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/explore?tag=acid"));
  });

  it("leaves external links, new tabs, modified clicks and same-page links alone", () => {
    removeGuard = setLeaveGuard(async () => false);
    render(<Links active />);
    expect(click("External")).toBe(false);
    expect(click("New tab")).toBe(false);
    expect(click("Explore", { metaKey: true })).toBe(false);
    expect(click("Same page")).toBe(false);
  });

  it("does nothing while inactive", () => {
    removeGuard = setLeaveGuard(async () => false);
    render(<Links active={false} />);
    expect(click("Explore")).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: "Explore" }));
    expect(router.push).not.toHaveBeenCalled();
  });
});
