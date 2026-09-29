export const KNOB_VALUE_MIN = 0;
export const KNOB_VALUE_MAX = 127;
export const DEFAULT_KNOB_VALUE = 64;
const PREVIOUS_KNOB_VALUE_MAX = 100;

export function normalizeKnobValue(value: number): number {
  return Math.round(Math.max(KNOB_VALUE_MIN, Math.min(KNOB_VALUE_MAX, value)));
}

export function percentageToMidiValue(value: number): number {
  const percentage = Math.max(0, Math.min(PREVIOUS_KNOB_VALUE_MAX, value));
  return Math.round((percentage * KNOB_VALUE_MAX) / PREVIOUS_KNOB_VALUE_MAX);
}
