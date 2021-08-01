import { ThermostatCharacteristicWrapper, MultiWrapper } from './base';
import { convertSystemTemp2CharTemp } from './helpers';
import { SYSTEM_MODE } from './infinityApi';

class CurrentACStatus extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.CurrentHeatingCoolingState;
  get = async () => {
    const current_state = await this.system.status.getMode();
    switch(current_state) {
      case SYSTEM_MODE.OFF:
      case SYSTEM_MODE.FAN_ONLY:
        return this.Characteristic.CurrentHeatingCoolingState.OFF;
      case SYSTEM_MODE.COOL:
        return this.Characteristic.CurrentHeatingCoolingState.COOL;
      case SYSTEM_MODE.HEAT:
        return this.Characteristic.CurrentHeatingCoolingState.HEAT;
      default:
        return this.Characteristic.CurrentHeatingCoolingState.OFF;
    }
  };
}
  
class CurrentTemp extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.CurrentTemperature;
  get = async () => {
    return convertSystemTemp2CharTemp(
      await this.system.status.getZoneTemp(this.context.zone),
      await this.system.config.getUnits(),
    );
  };
}

export class ACService extends MultiWrapper {
  WRAPPERS = [
    CurrentACStatus,
    CurrentTemp,
  ];
}
  