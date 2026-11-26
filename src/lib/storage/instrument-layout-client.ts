import { decodeInstrumentLayout } from '@/lib/adapters/instrument-layout-adapter';
import { api, type ApiResult } from '@/lib/api/client';
import type { InstrumentLayout } from '@/lib/instrument/layout';
import type { InstrumentDefinition } from '@/lib/instruments/types';

function readResponse(response: ApiResult<unknown>, instrument: InstrumentDefinition): InstrumentLayout {
  if (!response.ok) throw new Error('The instrument layout could not be loaded.');
  const layout = decodeInstrumentLayout(response.data, instrument.layout);
  if (!layout) throw new Error('The saved instrument layout is incompatible.');
  return layout;
}

export async function loadInstrumentLayout(instrument: InstrumentDefinition): Promise<InstrumentLayout> {
  return readResponse(await api.instruments.getLayout(instrument.id), instrument);
}

export async function saveInstrumentLayout(layout: InstrumentLayout, instrument: InstrumentDefinition): Promise<InstrumentLayout> {
  return readResponse(await api.instruments.saveLayout(instrument.id, layout), instrument);
}
