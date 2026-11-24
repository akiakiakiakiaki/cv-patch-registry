import type { PatchData } from '@/lib/domain/types';
import type { InstrumentLayout } from '@/lib/instrument/layout';

export type SwitchColor = 'red' | 'blue';

export interface InstrumentSwitchState {
  active: boolean;
  /** Fallback color when no category applies. */
  color: SwitchColor;
  /** Color category of the layout; takes precedence over `color`. */
  categoryId?: string;
  stateKey: string;
}

export interface InstrumentSwitchAdapter {
  getState(switches: PatchData['switches'], id: string): InstrumentSwitchState;
  /** All switch states one click changes (a selector changes several keys at once). */
  toggle(switches: PatchData['switches'], id: string): Record<string, boolean>;
}

export interface InstrumentDefinition {
  id: string;
  displayName: string;
  imageSrc: string;
  layoutFile: string;
  layout: InstrumentLayout;
  switchAdapter: InstrumentSwitchAdapter;
}
