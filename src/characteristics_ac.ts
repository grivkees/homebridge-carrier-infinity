import { CharacteristicValue } from 'homebridge';
import { ThermostatCharacteristicWrapper, MultiWrapper } from './characteristics_base';
import { convertCharTemp2SystemTemp, convertSystemTemp2CharTemp } from './helpers';
import { ACTIVITY, FAN_MODE, SYSTEM_MODE } from './api/constants';
import { combineLatest, debounceTime, distinctUntilChanged, firstValueFrom, map } from 'rxjs';

class CurrentACStatus extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.CurrentHeatingCoolingState;
  value = this.system.status.getZone(this.context.zone).mode.pipe(map(data => {
    switch(data) {
      case SYSTEM_MODE.OFF:
      case SYSTEM_MODE.FAN_ONLY:
        return this.Characteristic.CurrentHeatingCoolingState.OFF;
      case SYSTEM_MODE.COOL:
        return this.Characteristic.CurrentHeatingCoolingState.COOL;
      case SYSTEM_MODE.HEAT:
        return this.Characteristic.CurrentHeatingCoolingState.HEAT;
      default:
        this.log.error(`Unknown current state '${data}'. Report bug: https://bit.ly/3igbU7D`);
        return this.Characteristic.CurrentHeatingCoolingState.OFF;
    }
  }));
}

class TargetACState extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.TargetHeatingCoolingState;
  value = this.system.config.mode.pipe(map(data => {
    switch(data) {
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
        this.log.error(`Unknown target state '${data}'. Report bug: https://bit.ly/3igbU7D`);
        return this.Characteristic.TargetHeatingCoolingState.OFF;
    }
  }));

  set = async (value: CharacteristicValue) => {
    switch(value) {
      case this.Characteristic.TargetHeatingCoolingState.OFF: {
        // If manual fan is set, go to fan only mode
        if (await firstValueFrom(this.system.config.getZone(this.context.zone).fan) !== FAN_MODE.OFF) {
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
        this.log.error(`Don't know how to set target state '${value}'. Report bug: https://bit.ly/3igbU7D`);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
    }
  };
}

class DisplayUnits extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.TemperatureDisplayUnits;
  value = this.system.config.temp_units.pipe(map(
    data => data === 'F' ?
      this.Characteristic.TemperatureDisplayUnits.FAHRENHEIT :
      this.Characteristic.TemperatureDisplayUnits.CELSIUS),
  );
}

class CurrentTemp extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.CurrentTemperature;
  value = this.system.status.getZone(this.context.zone).temp.pipe(map(
    ([temp, temp_unit]) => {
      this.log.warn(`Temp changed to ${temp}`); // TODO: REMOVE ME
      return convertSystemTemp2CharTemp(temp, temp_unit);
    },
  ));
}

class CoolSetpoint extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.CoolingThresholdTemperature;
  props = this.system.config.temp_bounds.pipe(map(data => {
    return {
      minValue: Number(convertSystemTemp2CharTemp(data[0][0], data[0][1])),
      maxValue: Number(convertSystemTemp2CharTemp(data[1][0], data[1][1])),
    };
  }));

  value = this.system.config.getZone(this.context.zone).cool_setpoint.pipe(map(
    ([temp, temp_unit]) => convertSystemTemp2CharTemp(temp, temp_unit),
  ));

  set = async (value: CharacteristicValue) => {
    // Sync current activity settings to manual activity
    await this.system.config.setZoneActivityManualSync(
      this.context.zone,
      await firstValueFrom(this.system.getZoneActivity(this.context.zone)),
    );
    // Update manual activity
    await this.system.config.setZoneActivityManualSetpoints(
      this.context.zone,
      convertCharTemp2SystemTemp(value, await firstValueFrom(this.system.config.temp_units)),
      null,
    );
    // Enable manual activity hold
    await this.system.config.setZoneActivityHold(
      this.context.zone,
      ACTIVITY.MANUAL,
      await this.getHoldTime(),
    );
  };
}

class HeatSetpoint extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.HeatingThresholdTemperature;
  props = this.system.config.temp_bounds.pipe(map(data => {
    return {
      minValue: Number(convertSystemTemp2CharTemp(data[0][0], data[0][1])),
      maxValue: Number(convertSystemTemp2CharTemp(data[1][0], data[1][1])),
    };
  }));

  value = this.system.config.getZone(this.context.zone).heat_setpoint.pipe(map(
    ([temp, temp_unit]) => convertSystemTemp2CharTemp(temp, temp_unit),
  ));

  set = async (value: CharacteristicValue) => {
    // Sync current activity settings to manual activity
    await this.system.config.setZoneActivityManualSync(
      this.context.zone,
      await firstValueFrom(this.system.getZoneActivity(this.context.zone)),
    );
    // Update manual activity
    await this.system.config.setZoneActivityManualSetpoints(
      this.context.zone,
      null,
      convertCharTemp2SystemTemp(value, await firstValueFrom(this.system.config.temp_units)),
    );
    // Enable manual activity hold
    await this.system.config.setZoneActivityHold(
      this.context.zone,
      ACTIVITY.MANUAL,
      await this.getHoldTime(),
    );
  };
}

class GeneralSetpoint extends ThermostatCharacteristicWrapper {
  /*
   * HomeKit always sends this action. But we only use it when in a non-range
   * system mode (i.e. heat or cool, not auto).
   */
  ctype = this.Characteristic.TargetTemperature;
  props = this.system.config.temp_bounds.pipe(map(data => {
    return {
      minValue: Number(convertSystemTemp2CharTemp(data[0][0], data[0][1])),
      maxValue: Number(convertSystemTemp2CharTemp(data[1][0], data[1][1])),
    };
  }));

  value = combineLatest([
    this.system.config.mode,
    this.system.config.getZone(this.context.zone).cool_setpoint,
    this.system.config.getZone(this.context.zone).heat_setpoint,
  ]).pipe(
    debounceTime(50),
    map(
      ([c_mode, c_cool_setpoint, c_heat_setpoint]) => {
        switch (c_mode) {
          case SYSTEM_MODE.COOL:
            return convertSystemTemp2CharTemp(c_cool_setpoint[0], c_cool_setpoint[1]);
          case SYSTEM_MODE.HEAT:
            return convertSystemTemp2CharTemp(c_heat_setpoint[0], c_heat_setpoint[1]);
          default:
            return convertSystemTemp2CharTemp(
              (c_cool_setpoint[0] + c_heat_setpoint[0]) / 2,
              c_cool_setpoint[1],
            );
        }
      },
    ),
    distinctUntilChanged(),
  );

  set = async (value: CharacteristicValue) => {
    // Sync current activity settings to manual activity
    await this.system.config.setZoneActivityManualSync(
      this.context.zone,
      await firstValueFrom(this.system.getZoneActivity(this.context.zone)),
    );

    // Update manual activity
    const svalue = convertCharTemp2SystemTemp(value, await firstValueFrom(this.system.config.temp_units));
    const mode = await firstValueFrom(this.system.config.mode);
    switch (mode) {
      case SYSTEM_MODE.COOL:
        await this.system.config.setZoneActivityManualSetpoints(
          this.context.zone,
          svalue,
          null,
        );
        break;
      case SYSTEM_MODE.HEAT:
        await this.system.config.setZoneActivityManualSetpoints(
          this.context.zone,
          null,
          svalue,
        );
        break;
      case SYSTEM_MODE.AUTO:
        // For auto mode, Cool/Heat setpoints are used
        break;
      default:
        this.log.error(`Don't know how to set target temp for mode '${mode}'. Report bug: https://bit.ly/3igbU7D`);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.INVALID_VALUE_IN_REQUEST);
    }

    // Enable manual activity hold
    await this.system.config.setZoneActivityHold(
      this.context.zone,
      ACTIVITY.MANUAL,
      await this.getHoldTime(),
    );
  };
}

export class ACService extends MultiWrapper {
  WRAPPERS = [
    CurrentACStatus,
    TargetACState,
    DisplayUnits,
    CurrentTemp,
    GeneralSetpoint,
    CoolSetpoint,
    HeatSetpoint,
  ];
}
