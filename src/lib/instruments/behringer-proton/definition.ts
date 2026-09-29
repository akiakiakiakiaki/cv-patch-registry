import protonLayoutJson from '@/lib/instrument/behringer-proton/behringer-proton-layout.json';
import type { InstrumentLayout } from '@/lib/instrument/layout';
import type { InstrumentDefinition } from '@/lib/instruments/types';
import { protonSwitchAdapter } from '@/lib/instruments/behringer-proton/switch-adapter';

const layout = protonLayoutJson as unknown as InstrumentLayout;

export const behringerProton: InstrumentDefinition = {
  id: layout.id,
  displayName: layout.displayName,
  imageSrc: '/proton.svg',
  layoutFile: 'src/lib/instrument/behringer-proton/behringer-proton-layout.json',
  layout,
  switchAdapter: protonSwitchAdapter
};
