import { CharacteristicWrapper, MultiWrapper } from './base';
import { FAN_MODE } from './infinityApi';

class FanStatus extends CharacteristicWrapper {
  ctype = this.Characteristic.Active;
  get = async () => {
    return await this.system.config.getZoneActivityFan(
      this.context.zone,
      await this.getZoneActvity(this.context.zone),
    ) === FAN_MODE.OFF ?
      this.Characteristic.Active.INACTIVE :
      this.Characteristic.Active.ACTIVE;
  };
}

export class FanService extends MultiWrapper {
  WRAPPERS = [
    FanStatus,
  ];
}
