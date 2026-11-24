import { describe, expect, it } from "vitest";
import { COALESCE_MS, emptyHistory, historyShortcut, recordChange, redoStep, undoStep } from "@/components/synth-editor/control-history";

describe("control history", () => {
  it("undoes and redoes recorded steps in order", () => {
    let history = recordChange(emptyHistory<string>(), "a", undefined, 0);
    history = recordChange(history, "b", undefined, 10);
    const first = undoStep(history, "c")!;
    expect(first.value).toBe("b");
    const second = undoStep(first.history, first.value)!;
    expect(second.value).toBe("a");
    expect(undoStep(second.history, second.value)).toBeNull();
    const again = redoStep(second.history, second.value)!;
    expect(again.value).toBe("b");
    expect(redoStep(again.history, again.value)!.value).toBe("c");
  });

  it("merges changes of the same kind and control within the window only", () => {
    let history = recordChange(emptyHistory<number>(), 1, "move:a", 0);
    history = recordChange(history, 2, "move:a", COALESCE_MS - 1);
    expect(history.past).toEqual([1]);
    history = recordChange(history, 3, "move:b", COALESCE_MS);
    history = recordChange(history, 4, "move:b", 3 * COALESCE_MS);
    expect(history.past).toEqual([1, 3, 4]);
    expect(recordChange(history, 5, undefined, 3 * COALESCE_MS + 1).past).toEqual([1, 3, 4, 5]);
  });

  it("forgets redo steps after a new change", () => {
    const history = recordChange(emptyHistory<string>(), "a", undefined, 0);
    const undone = undoStep(history, "b")!;
    expect(recordChange(undone.history, "a", undefined, 1).future).toEqual([]);
  });
});

describe("historyShortcut", () => {
  const key = (init: Partial<KeyboardEvent> & { target?: EventTarget | null }) =>
    historyShortcut({ key: "z", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, target: document.body, ...init });

  it("maps Cmd/Ctrl+Z to undo and Cmd/Ctrl+Shift+Z to redo", () => {
    expect(key({ ctrlKey: true })).toBe("undo");
    expect(key({ metaKey: true })).toBe("undo");
    expect(key({ metaKey: true, shiftKey: true, key: "Z" })).toBe("redo");
  });

  it("ignores other keys, Alt combinations and plain Z", () => {
    expect(key({})).toBeNull();
    expect(key({ ctrlKey: true, key: "y" })).toBeNull();
    expect(key({ ctrlKey: true, altKey: true })).toBeNull();
  });

  it("leaves text fields their own undo", () => {
    const input = document.createElement("input");
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(key({ ctrlKey: true, target: input })).toBeNull();
    expect(key({ ctrlKey: true, target: editable })).toBeNull();
  });
});
