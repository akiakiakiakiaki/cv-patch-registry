import type { PatchData } from '@/lib/domain/types';
import type { InstrumentLayout } from '@/lib/instrument/layout';

export type SwitchColor = 'red' | 'blue';

export interface InstrumentSwitchState {
  active: boolean;
  color: SwitchColor;
  stateKey: string;
}

export interface InstrumentSwitchAdapter {
  getState(switches: PatchData['switches'], id: string): InstrumentSwitchState;
  toggle(switches: PatchData['switches'], id: string): { id: string; value: boolean };
}

export interface InstrumentDefinition {
  id: string;
  displayName: string;
  imageSrc: string;
  layoutFile: string;
  layout: InstrumentLayout;
  switchAdapter: InstrumentSwitchAdapter;
}
