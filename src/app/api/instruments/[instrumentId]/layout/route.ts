import { NextResponse } from 'next/server';
import { decodeInstrumentLayout } from '@/lib/adapters/instrument-layout-adapter';
import { getInstrument } from '@/lib/instruments/registry';
import { InstrumentLayoutRepository } from '@/lib/storage/instrument-layout-repository';
import { requireUser } from '@/lib/auth/session';
import { hasCapability, roleForUser } from '@/lib/auth/roles';
import { invalidJsonResponse } from '@/lib/http/patch-responses';
import { readJsonLimited } from '@/lib/http/read-json-limited';
import { rejectCrossOriginMutation } from '@/lib/http/mutation-origin';

export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ instrumentId: string }> };

function isDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_LAYOUT === 'true';
}

export async function GET(_request: Request, { params }: RouteContext) {
  if (!isDebugEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasCapability(roleForUser(user), 'adjustBuiltInLayout')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
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
  const originFailure = rejectCrossOriginMutation(request);
  if (originFailure) return originFailure;
  if (!isDebugEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!hasCapability(roleForUser(user), 'adjustBuiltInLayout')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { instrumentId } = await params;
  const instrument = getInstrument(instrumentId);
  if (!instrument) return NextResponse.json({ error: 'Unknown instrument' }, { status: 404 });

  const parsed = await readJsonLimited(request, 512 * 1024);
  if (!parsed.ok) return invalidJsonResponse(parsed.reason);
  try {
    const layout = decodeInstrumentLayout(parsed.value, instrument.layout);
    if (!layout) return NextResponse.json({ error: 'Incompatible layout data' }, { status: 409 });
    const repository = new InstrumentLayoutRepository(instrument);
    await repository.save(layout);
    return NextResponse.json(layout);
  } catch {
    return NextResponse.json({ error: 'Layout document could not be written' }, { status: 500 });
  }
}
