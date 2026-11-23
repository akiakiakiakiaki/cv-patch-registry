import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { encodeInstrumentLayout } from '@/lib/adapters/instrument-layout-adapter';
import type { InstrumentLayout } from '@/lib/instrument/layout';
import type { InstrumentDefinition } from '@/lib/instruments/types';

export class InstrumentLayoutRepository {
  private readonly layoutPath: string;

  constructor(instrument: InstrumentDefinition) {
    this.layoutPath = path.join(process.cwd(), instrument.layoutFile);
  }

  async load(): Promise<unknown> {
    const layoutPath = this.layoutPath;
    const contents = await readFile(/* turbopackIgnore: true */ layoutPath, 'utf8');
    return JSON.parse(contents) as unknown;
  }

  async save(layout: InstrumentLayout): Promise<void> {
    const temporaryPath = `${this.layoutPath}.tmp`;
    const layoutPath = this.layoutPath;
    await writeFile(/* turbopackIgnore: true */ temporaryPath, `${JSON.stringify(encodeInstrumentLayout(layout), null, 2)}\n`, 'utf8');
    await rename(temporaryPath, /* turbopackIgnore: true */ layoutPath);
  }
}
