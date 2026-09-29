import { NextResponse } from "next/server";
import { decodeInstrumentLayout } from "@/lib/adapters/instrument-layout-adapter";
import { ProtonLayoutRepository } from "@/lib/storage/proton-layout-repository";
import { behringerProton } from "@/lib/instruments/behringer-proton/definition";

export const runtime = "nodejs";

const repository = new ProtonLayoutRepository();

function isDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEBUG_LAYOUT === "true";
}

export async function GET() {
  if (!isDebugEnabled())
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const layout = decodeInstrumentLayout(
      await repository.load(),
      behringerProton.layout,
    );
    if (!layout)
      return NextResponse.json(
        { error: "Invalid layout file" },
        { status: 500 },
      );
    return NextResponse.json(layout);
  } catch {
    return NextResponse.json(
      { error: "Layout file could not be read" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  if (!isDebugEnabled())
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const layout = decodeInstrumentLayout(
      (await request.json()) as unknown,
      behringerProton.layout,
    );
    if (!layout)
      return NextResponse.json(
        { error: "Invalid layout data" },
        { status: 400 },
      );
    await repository.save(layout);
    return NextResponse.json(layout);
  } catch {
    return NextResponse.json(
      { error: "Layout file could not be written" },
      { status: 500 },
    );
  }
}
