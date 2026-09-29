import { decodeInstrumentLayout } from '@/lib/adapters/instrument-layout-adapter';
import type { InstrumentLayout } from '@/lib/instrument/layout';
import type { InstrumentDefinition } from '@/lib/instruments/types';

async function readResponse(response: Response, instrument: InstrumentDefinition): Promise<InstrumentLayout> {
  if (!response.ok) throw new Error('The instrument layout could not be loaded.');
  const layout = decodeInstrumentLayout(await response.json() as unknown, instrument.layout);
  if (!layout) throw new Error('The saved instrument layout is incompatible.');
  return layout;
}

function layoutUrl(instrument: InstrumentDefinition): string {
  return `/api/instruments/${encodeURIComponent(instrument.id)}/layout`;
}

export async function loadInstrumentLayout(instrument: InstrumentDefinition): Promise<InstrumentLayout> {
  return readResponse(await fetch(layoutUrl(instrument), { cache: 'no-store' }), instrument);
}

export async function saveInstrumentLayout(layout: InstrumentLayout, instrument: InstrumentDefinition): Promise<InstrumentLayout> {
  const response = await fetch(layoutUrl(instrument), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(layout)
  });
  return readResponse(response, instrument);
}
