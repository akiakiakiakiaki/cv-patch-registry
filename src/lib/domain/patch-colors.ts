export const PATCH_CABLE_COLORS = [
  { id: "black", value: "var(--patch-color-black)" },
  { id: "white", value: "var(--patch-color-white)" },
  { id: "gray", value: "var(--patch-color-gray)" },
  { id: "yellow", value: "var(--patch-color-yellow)" },
  { id: "red", value: "var(--patch-color-red)" },
  { id: "blue", value: "var(--patch-color-blue)" },
] as const;

export function normalizePatchCableColor(value: unknown): string {
  const currentColor = PATCH_CABLE_COLORS.find(
    (color) => color.value === value,
  );
  return currentColor?.value ?? PATCH_CABLE_COLORS[4].value;
}
