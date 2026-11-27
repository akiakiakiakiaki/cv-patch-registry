import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { NumberField } from "@/components/number-field/NumberField";

function Harness({ onChange, initial = 1 }: { onChange: (value: number) => void; initial?: number }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberField
        label="Factor"
        value={value}
        min={0.25}
        max={4}
        step={0.05}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
      <button onClick={() => setValue(3)}>elsewhere</button>
    </>
  );
}

describe("NumberField", () => {
  it("reports only valid numbers inside the limits while typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const field = screen.getByRole("spinbutton", { name: "Factor" });
    await user.clear(field);
    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveValue(null);
    await user.type(field, "2.5");
    expect(onChange).toHaveBeenLastCalledWith(2.5);
    await user.clear(field);
    await user.type(field, "9");
    expect(onChange).toHaveBeenLastCalledWith(2.5);
  });

  it("shows the current value again when left with incomplete or invalid text", async () => {
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);
    const field = screen.getByRole("spinbutton", { name: "Factor" });
    await user.clear(field);
    fireEvent.blur(field);
    expect(field).toHaveValue(1);
  });

  it("follows a value changed elsewhere", async () => {
    const user = userEvent.setup();
    render(<Harness onChange={vi.fn()} />);
    await user.type(screen.getByRole("spinbutton", { name: "Factor" }), "5");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.getByRole("spinbutton", { name: "Factor" })).toHaveValue(3);
  });
});
