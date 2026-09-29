import type { PatchData } from '@/lib/domain/types';
import type { InstrumentSwitchAdapter } from '@/lib/instruments/types';

export const genericSwitchAdapter: InstrumentSwitchAdapter = {
  getState(switches: PatchData['switches'], id: string) {
    return { active: switches[id] ?? false, color: 'blue', stateKey: id };
  },
  toggle(switches: PatchData['switches'], id: string) {
    return { id, value: !(switches[id] ?? false) };
  }
};
