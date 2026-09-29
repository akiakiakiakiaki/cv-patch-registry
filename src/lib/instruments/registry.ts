import { behringerProton } from '@/lib/instruments/behringer-proton/definition';
import type { InstrumentDefinition } from '@/lib/instruments/types';

export const INSTRUMENTS: readonly InstrumentDefinition[] = [behringerProton];
export const DEFAULT_INSTRUMENT = behringerProton;
export const DEFAULT_INSTRUMENT_ID = DEFAULT_INSTRUMENT.id;

export function getInstrument(id: string): InstrumentDefinition | undefined {
  return INSTRUMENTS.find((instrument) => instrument.id === id);
}
