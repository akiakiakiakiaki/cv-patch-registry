import { behringerProton } from '@/lib/instruments/behringer-proton/definition';
import { loadInstrumentLayout, saveInstrumentLayout } from '@/lib/storage/instrument-layout-client';
import type { InstrumentLayout } from '@/lib/instrument/layout';

export function loadProtonLayout(): Promise<InstrumentLayout> {
  return loadInstrumentLayout(behringerProton);
}

export function saveProtonLayout(layout: InstrumentLayout): Promise<InstrumentLayout> {
  return saveInstrumentLayout(layout, behringerProton);
}
