import type { PatchData } from '@/lib/domain/types';
import type { InstrumentSwitchAdapter, InstrumentSwitchState } from '@/lib/instruments/types';

const SHIFT_ID = 'Shift';
const SHIFT_CHANNEL_KEY = 'Shift::blue';
const DUAL_CHANNEL_SWITCH_IDS = new Set([
  '1 shot', 'Sync LFO', 'Retrig LFO', 'Loop', 'Bounce', 'Sustain', 'Invert', 'Reverse', 'Retrig ASR'
]);

function selectedChannel(switches: PatchData['switches']): 'red' | 'blue' {
  return switches[SHIFT_CHANNEL_KEY] ? 'blue' : 'red';
}

function switchStateKey(id: string, channel: 'red' | 'blue'): string {
  return channel === 'red' ? id : `${id}::blue`;
}

export const protonSwitchAdapter: InstrumentSwitchAdapter = {
  getState(switches: PatchData['switches'], id: string): InstrumentSwitchState {
    const channel = selectedChannel(switches);
    if (id === SHIFT_ID) return { active: true, color: channel, stateKey: SHIFT_CHANNEL_KEY };
    const stateKey = DUAL_CHANNEL_SWITCH_IDS.has(id) ? switchStateKey(id, channel) : id;
    return {
      active: switches[stateKey] ?? false,
      color: DUAL_CHANNEL_SWITCH_IDS.has(id) ? channel : 'blue',
      stateKey
    };
  },
  toggle(switches: PatchData['switches'], id: string) {
    if (id === SHIFT_ID) {
      return { id: SHIFT_CHANNEL_KEY, value: selectedChannel(switches) !== 'blue' };
    }
    const state = this.getState(switches, id);
    return { id: state.stateKey, value: !state.active };
  }
};
