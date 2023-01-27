import { map, of, switchMap } from 'rxjs';
import { CharacteristicWrapper, MultiWrapper } from './characteristics_base';

class FilterLife extends CharacteristicWrapper {
  ctype = this.Characteristic.FilterLifeLevel;
  value = this.system.status.filter_used.pipe(map(x => 100 - x));
}

class FilterChange extends CharacteristicWrapper {
  ctype = this.Characteristic.FilterChangeIndication;
  value = this.system.status.filter_used.pipe(map(
    x => x > 95 ?
      this.Characteristic.FilterChangeIndication.CHANGE_FILTER :
      this.Characteristic.FilterChangeIndication.FILTER_OK,
  ));
}

export class FilterService extends MultiWrapper {
  WRAPPERS = [
    FilterLife,
    FilterChange,
  ];
}
