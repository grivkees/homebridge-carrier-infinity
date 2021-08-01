import { CharacteristicValue } from 'homebridge';
import { ThermostatCharacteristicWrapper, MultiWrapper } from './base';
import { convertCharFan2SystemFan, convertSystemFan2CharFan } from './helpers';
import { FAN_MODE, SYSTEM_MODE } from './infinityApi';

class FanStatus extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.Active;
  get = async () => {
    return await this.system.config.getZoneActivityFan(
      this.context.zone,
      await this.getActivity(),
    ) === FAN_MODE.OFF ?
      this.Characteristic.Active.INACTIVE :
      this.Characteristic.Active.ACTIVE;
  };
}

class FanSpeed extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.RotationSpeed;
  props = {minValue: 0, maxValue: 3, minStep: 1};

  get = async () => {
    return convertSystemFan2CharFan(
      await this.system.config.getZoneActivityFan(this.context.zone, await this.getActivity()),
    );
  };

  set = async (value: CharacteristicValue) => {
    // Make sure system mode is right for manual fan settings
    if (
      await this.system.config.getMode() === SYSTEM_MODE.OFF &&
        convertCharFan2SystemFan(value) !== FAN_MODE.OFF
    ) {
      await this.system.config.setMode(SYSTEM_MODE.FAN_ONLY);
    } else if (
      await this.system.config.getMode() === SYSTEM_MODE.FAN_ONLY &&
        convertCharFan2SystemFan(value) === FAN_MODE.OFF
    ) {
      await this.system.config.setMode(SYSTEM_MODE.OFF);
    }
    // Set zone activity
    return await this.system.config.setZoneActivity(
      this.context.zone,
      null,
      null,
      await this.getHoldTime(),
      convertCharFan2SystemFan(value),
    );
  };

}

export class FanService extends MultiWrapper {
  WRAPPERS = [
    FanStatus,
    FanSpeed,
  ];
}
