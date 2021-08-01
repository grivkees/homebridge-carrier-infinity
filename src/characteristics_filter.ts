import { CharacteristicWrapper, MultiWrapper } from './base';

class FilterLife extends CharacteristicWrapper {
  ctype = this.Characteristic.FilterLifeLevel;
  get = async () => {
    return 100 - (await this.system.status.getFilterUsed());
  };
}

class FilterChange extends CharacteristicWrapper {
  ctype = this.Characteristic.FilterChangeIndication;
  get = async () => {
    return (await this.system.status.getFilterUsed()) > 95 ?
      this.Characteristic.FilterChangeIndication.CHANGE_FILTER :
      this.Characteristic.FilterChangeIndication.FILTER_OK;
  };
}

export class FilterService extends MultiWrapper {
  WRAPPERS = [
    FilterLife,
    FilterChange,
  ];
}
