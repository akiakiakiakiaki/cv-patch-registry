import { NextResponse } from 'next/server';
import { decodeInstrumentLayout } from '@/lib/adapters/instrument-layout-adapter';
import { getInstrument } from '@/lib/instruments/registry';
import { InstrumentLayoutRepository } from '@/lib/storage/instrument-layout-repository';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ instrumentId: string }> };

function isDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_LAYOUT === 'true';
}

export async function GET(_request: Request, { params }: RouteContext) {
  if (!isDebugEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { instrumentId } = await params;
  const instrument = getInstrument(instrumentId);
  if (!instrument) return NextResponse.json({ error: 'Unknown instrument' }, { status: 404 });

  try {
    const repository = new InstrumentLayoutRepository(instrument);
    const layout = decodeInstrumentLayout(await repository.load(), instrument.layout);
    if (!layout) return NextResponse.json({ error: 'Incompatible layout document' }, { status: 409 });
    return NextResponse.json(layout);
  } catch {
    return NextResponse.json({ error: 'Layout document could not be read' }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  if (!isDebugEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { instrumentId } = await params;
  const instrument = getInstrument(instrumentId);
  if (!instrument) return NextResponse.json({ error: 'Unknown instrument' }, { status: 404 });

  try {
    const layout = decodeInstrumentLayout(await request.json() as unknown, instrument.layout);
    if (!layout) return NextResponse.json({ error: 'Incompatible layout data' }, { status: 409 });
    const repository = new InstrumentLayoutRepository(instrument);
    await repository.save(layout);
    return NextResponse.json(layout);
  } catch {
    return NextResponse.json({ error: 'Layout document could not be written' }, { status: 500 });
  }
}
