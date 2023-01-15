import { CharacteristicValue } from 'homebridge';
import { ThermostatCharacteristicWrapper, MultiWrapper } from './characteristics_base';
import { convertCharFan2SystemFan, convertSystemFan2CharFan } from './helpers';
import { FAN_MODE, SYSTEM_MODE } from './api/constants';

/*
 * Controls for system fan.
 *
 * Fan is controlled using a slider with the following steps:
 * 0. Auto (0%)
 * 1. Always On Low (33%)
 * 2. Always On Medium (66%)
 * 3. Always On High (100%)
 *
 * HomeKit will also show a "Auto/Manual" slider, which will always reflect the
 * setting above. Manual denotes an Always On option is active.
 *
 * If a user ever tries to control the fan when their system is OFF, the system
 * will be changed to FAN_ONLY mode. To get out of FAN_ONLY mode, the user can
 * change the thermostat to an ON mode (HEAT/COOL/AUTO).
 */

class FanStatus extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.Active;
  get = async () => {
    if (
      // if the system is configured to be off, the fan must be off
      await this.system.config.getMode() === SYSTEM_MODE.OFF
    ) {
      return this.Characteristic.Active.INACTIVE;
    } else if (
      // zone config api says manual fan mode
      await this.system.config.getZoneActivityFan(this.context.zone, await this.getActivity()) !== FAN_MODE.OFF ||
      // zone status api says fan is on
      await this.system.status.getZoneFan(this.context.zone) !== FAN_MODE.OFF ||
      // zone status api says zone is conditioning
      await this.system.status.getZoneConditioning(this.context.zone) !== SYSTEM_MODE.OFF
    ) {
      // but there is an exception to the above... which is the fan status/config
      // can be wrong if the zone is actually closed off.
      if (await this.system.status.getZoneOpen(this.context.zone)) {
        return this.Characteristic.Active.ACTIVE;
      } else {
        return this.Characteristic.Active.INACTIVE;
      }
    } else {
      return this.Characteristic.Active.INACTIVE;
    }
  };

  set = async (value: CharacteristicValue) => {
    // if we are trying to *turn on* fan, and system is off, set to fan only mode
    if (
      value === this.Characteristic.Active.ACTIVE &&
      await this.system.config.getMode() === SYSTEM_MODE.OFF
    ) {
      return await this.system.config.setMode(SYSTEM_MODE.FAN_ONLY);
    }

    // if we are trying to turn off fan, turn off fan override (i.e. set fan speed=auto)
    // NOTE: If system is in FAN_ONLY mode, it will remain in FAN ONLY, but with speed=auto.
    if (value === this.Characteristic.Active.INACTIVE) {
      return await this.system.config.setZoneActivityManualHold(
        this.context.zone,
        null,
        null,
        await this.getHoldTime(),
        FAN_MODE.OFF,
      );
    }
  };
}

class FanState extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.CurrentFanState;
  get = async () => {
    if (
      // if the system is configured to be off, the fan must be off
      await this.system.config.getMode() === SYSTEM_MODE.OFF
    ) {
      return this.Characteristic.CurrentFanState.INACTIVE;
    } else if (
      // zone config api says manual fan mode
      await this.system.config.getZoneActivityFan(this.context.zone, await this.getActivity()) !== FAN_MODE.OFF ||
      // zone status api says fan is on
      await this.system.status.getZoneFan(this.context.zone) !== FAN_MODE.OFF ||
      // zone status api says zone is conditioning
      await this.system.status.getZoneConditioning(this.context.zone) !== SYSTEM_MODE.OFF
    ) {
      // but there is an exception to the above... which is the fan status/config
      // can be wrong if the zone is actually closed off.
      if (await this.system.status.getZoneOpen(this.context.zone)) {
        return this.Characteristic.CurrentFanState.BLOWING_AIR;
      } else {
        return this.Characteristic.CurrentFanState.IDLE;
      }
    } else {
      return this.Characteristic.CurrentFanState.IDLE;
    }
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
    // if we are trying to control fan, and system is off, set to fan only mode
    if (await this.system.config.getMode() === SYSTEM_MODE.OFF) {
      await this.system.config.setMode(SYSTEM_MODE.FAN_ONLY);
    }

    // set fan speed
    return await this.system.config.setZoneActivityManualHold(
      this.context.zone,
      null,
      null,
      await this.getHoldTime(),
      convertCharFan2SystemFan(value),
    );
  };
}

class TargetFanState extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.TargetFanState;

  get = async () => {
    return await this.system.config.getZoneActivityFan(
      this.context.zone,
      await this.getActivity(),
    ) === FAN_MODE.OFF ?
      this.Characteristic.TargetFanState.AUTO :
      this.Characteristic.TargetFanState.MANUAL;
  };

  set = async (value: CharacteristicValue) => {
    // if we are trying to control fan, and system is off, set to fan only mode
    if (await this.system.config.getMode() === SYSTEM_MODE.OFF) {
      await this.system.config.setMode(SYSTEM_MODE.FAN_ONLY);
    }

    // set fan speed to switch between auto and manual
    return await this.system.config.setZoneActivityManualHold(
      this.context.zone,
      null,
      null,
      await this.getHoldTime(),
      value === this.Characteristic.TargetFanState.AUTO ?
        FAN_MODE.OFF :  // fan off is auto
        FAN_MODE.MED, // moving to manual defaults to med
    );
  };
}

export class FanService extends MultiWrapper {
  WRAPPERS = [
    FanStatus,
    FanState,
    FanSpeed,
    TargetFanState,
  ];
}
