import { Characteristic } from 'hap-nodejs';
import { CharacteristicWrapper, MultiWrapper } from './base';

class FilterLife extends CharacteristicWrapper {
  ctype = Characteristic.FilterLifeLevel;
  get = async () => {
    return 100 - (await this.system.status.getFilterUsed());
  };
}

class FilterChange extends CharacteristicWrapper {
  ctype = Characteristic.FilterChangeIndication;
  get = async () => {
    return (await this.system.status.getFilterUsed()) > 95 ?
      Characteristic.FilterChangeIndication.CHANGE_FILTER :
      Characteristic.FilterChangeIndication.FILTER_OK;
  };
}

export class FilterService extends MultiWrapper {
  WRAPPERS = [
    FilterLife,
    FilterChange,
  ];
}
