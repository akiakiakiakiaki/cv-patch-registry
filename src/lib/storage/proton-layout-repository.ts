import { behringerProton } from '@/lib/instruments/behringer-proton/definition';
import { InstrumentLayoutRepository } from '@/lib/storage/instrument-layout-repository';

export class ProtonLayoutRepository extends InstrumentLayoutRepository {
  constructor() {
    super(behringerProton);
  }
}
