import type { PatchData } from '@/lib/domain/types';
import { layoutSwitchState, toggleLayoutSwitch } from '@/lib/domain/switch-categories';
import type { InstrumentLayout } from '@/lib/instrument/layout';
import type { InstrumentSwitchAdapter } from '@/lib/instruments/types';

/** Switch behavior driven by the layout: plain switches, selectors and their dependents (see SwitchDefinition). */
export function createLayoutSwitchAdapter(layout: Pick<InstrumentLayout, 'switches'>): InstrumentSwitchAdapter {
  return {
    getState(switches: PatchData['switches'], id: string) {
      const state = layoutSwitchState(layout.switches, switches, id);
      return { active: state.active, color: 'blue', stateKey: state.stateKey, ...(state.categoryId ? { categoryId: state.categoryId } : {}) };
    },
    toggle(switches: PatchData['switches'], id: string) {
      return toggleLayoutSwitch(layout.switches, switches, id);
    }
  };
}

/** Plain on/off switches without categories. */
export const genericSwitchAdapter: InstrumentSwitchAdapter = createLayoutSwitchAdapter({ switches: [] });
