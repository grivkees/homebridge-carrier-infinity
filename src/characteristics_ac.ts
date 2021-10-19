import { CharacteristicValue } from 'homebridge';
import { ThermostatCharacteristicWrapper, MultiWrapper } from './base';
import { convertSystemTemp2CharTemp } from './helpers';
import { FAN_MODE, SYSTEM_MODE } from './infinityApi';

class CurrentACStatus extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.CurrentHeatingCoolingState;
  get = async () => {
    const current_state = await this.system.status.getZoneConditioning(this.context.zone);
    switch(current_state) {
      case SYSTEM_MODE.OFF:
      case SYSTEM_MODE.FAN_ONLY:
        return this.Characteristic.CurrentHeatingCoolingState.OFF;
      case SYSTEM_MODE.COOL:
        return this.Characteristic.CurrentHeatingCoolingState.COOL;
      case SYSTEM_MODE.HEAT:
        return this.Characteristic.CurrentHeatingCoolingState.HEAT;
      default:
        this.log.error(`Unknown current state '${current_state}'. Defaulting to off.`);
        return this.Characteristic.CurrentHeatingCoolingState.OFF;
    }
  };
}

class TargetACState extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.TargetHeatingCoolingState;
  get = async () => {
    const target_state = await this.system.config.getMode();
    switch(target_state) {
      case SYSTEM_MODE.OFF:
      case SYSTEM_MODE.FAN_ONLY:
        return this.Characteristic.TargetHeatingCoolingState.OFF;
      case SYSTEM_MODE.COOL:
        return this.Characteristic.TargetHeatingCoolingState.COOL;
      case SYSTEM_MODE.HEAT:
        return this.Characteristic.TargetHeatingCoolingState.HEAT;
      case SYSTEM_MODE.AUTO:
        return this.Characteristic.TargetHeatingCoolingState.AUTO;
      default:
        this.log.error(`Unknown target state '${target_state}'. Defaulting to off.`);
        return this.Characteristic.TargetHeatingCoolingState.OFF;
    }
  };

  set = async (value: CharacteristicValue) => {
    switch(value) {
      case this.Characteristic.TargetHeatingCoolingState.OFF: {
        // If manual fan is set, go to fan only mode
        if (await this.system.config.getZoneActivityFan(this.context.zone, await this.getActivity()) !== FAN_MODE.OFF) {
          return await this.system.config.setMode(SYSTEM_MODE.FAN_ONLY);
        // If no manual fan, go to full off
        } else {
          return await this.system.config.setMode(SYSTEM_MODE.OFF);
        }
      }
      case this.Characteristic.TargetHeatingCoolingState.COOL:
        return await this.system.config.setMode(SYSTEM_MODE.COOL);
      case this.Characteristic.TargetHeatingCoolingState.HEAT:
        return await this.system.config.setMode(SYSTEM_MODE.HEAT);
      case this.Characteristic.TargetHeatingCoolingState.AUTO:
        return await this.system.config.setMode(SYSTEM_MODE.AUTO);
      default:
        this.log.error(`Don't know how to set target state '${value}'. Making no change.`);
    }
  };
}

class DisplayUnits extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.CurrentTemperature;
  get = async () => {
    return await this.system.config.getUnits() === 'F' ?
      this.Characteristic.TemperatureDisplayUnits.FAHRENHEIT :
      this.Characteristic.TemperatureDisplayUnits.CELSIUS;
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
    TargetACState,
    DisplayUnits,
    CurrentTemp,
  ];
}
  