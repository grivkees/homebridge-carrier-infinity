import { CharacteristicValue } from 'homebridge';
import { ThermostatCharacteristicWrapper, MultiWrapper } from './characteristics_base';
import { convertCharFan2SystemFan, convertSystemFan2CharFan } from './helpers';
import { ACTIVITY, FAN_MODE, SYSTEM_MODE } from './api/constants';
import { combineLatest, debounceTime, distinctUntilChanged, firstValueFrom, map, of } from 'rxjs';

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
  value = combineLatest([
    this.system.config.mode,
    this.system.config.getZone(this.context.zone).fan,
    this.system.status.getZone(this.context.zone).blowing,
    this.system.status.getZone(this.context.zone).closed,
  ]).pipe(
    debounceTime(50),
    map(
      ([c_mode, c_fan, s_blowing, s_closed]) => {
        // First, we do the absolute checks. If the status says blowing, or the system
        // is shut off, we know the state.
        if (s_blowing) {
          return this.Characteristic.Active.ACTIVE;
        } else if (c_mode === SYSTEM_MODE.OFF) {
          return this.Characteristic.Active.INACTIVE;
        // Second, we check for the edge case between when a user changes the state
        // and the system picks it up. If the fan is set to on, the fan will be on
        // soon, even though it isn't yet (which we know since blowing was false).
        // This mitigates switch instability.
        // However, we only do this edge case fix if the damper status is not closed,
        // since if the damper reports it is closed, there is a good chance the
        // config may be ignored for one reason or another. (#156)
        } else if (c_fan !== FAN_MODE.OFF && !s_closed) {
          return this.Characteristic.Active.ACTIVE;
        }
        // Finally, if we get here the zone is not blowing.
        return this.Characteristic.Active.INACTIVE;
      },
    ),
    distinctUntilChanged(),
  );

  set = async (value: CharacteristicValue) => {
    // if we are trying to *turn on* fan, and system is off, set to fan only mode
    if (
      value === this.Characteristic.Active.ACTIVE &&
      await firstValueFrom(this.system.config.mode) === SYSTEM_MODE.OFF
    ) {
      return await this.system.config.setMode(SYSTEM_MODE.FAN_ONLY);
    }

    // if we are trying to turn off fan, turn off fan override (i.e. set fan speed=auto)
    // NOTE: If system is in FAN_ONLY mode, it will remain in FAN ONLY, but with speed=auto.
    if (value === this.Characteristic.Active.INACTIVE) {
      // Sync current activity settings to manual activity
      await this.system.config.setZoneActivityManualSync(
        this.context.zone,
        await firstValueFrom(this.system.getZoneActivity(this.context.zone)),
      );
      // Update manual activity fan speed
      await this.system.config.setZoneActivityManualFan(
        this.context.zone,
        FAN_MODE.OFF,
      );
      // Enable manual activity hold
      await this.system.config.setZoneActivityHold(
        this.context.zone,
        ACTIVITY.MANUAL,
        await this.getHoldTime(),
      );
    }
  };
}

class FanState extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.CurrentFanState;
  value = combineLatest([
    this.system.config.mode,
    this.system.config.getZone(this.context.zone).fan,
    this.system.status.getZone(this.context.zone).blowing,
    this.system.status.getZone(this.context.zone).closed,
  ]).pipe(
    debounceTime(50),
    map(
      ([c_mode, c_fan, s_blowing, s_closed]) => {
        // First, we do the absolute checks. If the status says blowing, or the system
        // is shut off, we know the state.
        if (s_blowing) {
          return this.Characteristic.CurrentFanState.BLOWING_AIR;
        } else if (c_mode === SYSTEM_MODE.OFF) {
          return this.Characteristic.CurrentFanState.INACTIVE;
          // Second, we check for the edge case between when a user changes the state
          // and the system picks it up. If the fan is set to on, the fan will be on
          // soon, even though it isn't yet (which we know since blowing was false).
          // This mitigates switch instability.
          // However, we only do this edge case fix if the damper status is not closed,
          // since if the damper reports it is closed, there is a good chance the
          // config may be ignored for one reason or another. (#156)
        } else if (c_fan !== FAN_MODE.OFF && !s_closed) {
          return this.Characteristic.CurrentFanState.BLOWING_AIR;
        }
        // Finally, if we get here the zone is not blowing.
        return this.Characteristic.CurrentFanState.IDLE;
      },
    ),
    distinctUntilChanged(),
  );
}

class FanSpeed extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.RotationSpeed;
  props = of({minValue: 0, maxValue: 3, minStep: 1});
  value = this.system.config.getZone(this.context.zone).fan.pipe(map(data => convertSystemFan2CharFan(data)));

  set = async (value: CharacteristicValue) => {
    // if we are trying to control fan, and system is off, set to fan only mode
    if (await firstValueFrom(this.system.config.mode) === SYSTEM_MODE.OFF) {
      await this.system.config.setMode(SYSTEM_MODE.FAN_ONLY);
    }

    // Sync current activity settings to manual activity
    await this.system.config.setZoneActivityManualSync(
      this.context.zone,
      await firstValueFrom(this.system.getZoneActivity(this.context.zone)),
    );
    // Update manual activity fan speed
    await this.system.config.setZoneActivityManualFan(
      this.context.zone,
      convertCharFan2SystemFan(value),
    );
    // Enable manual activity hold
    await this.system.config.setZoneActivityHold(
      this.context.zone,
      ACTIVITY.MANUAL,
      await this.getHoldTime(),
    );
  };
}

class TargetFanState extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.TargetFanState;
  value = this.system.config.getZone(this.context.zone).fan.pipe(
    map(data => data === FAN_MODE.OFF ?
      this.Characteristic.TargetFanState.AUTO :
      this.Characteristic.TargetFanState.MANUAL),
  );

  set = async (value: CharacteristicValue) => {
    // if we are trying to control fan, and system is off, set to fan only mode
    if (await firstValueFrom(this.system.config.mode) === SYSTEM_MODE.OFF) {
      await this.system.config.setMode(SYSTEM_MODE.FAN_ONLY);
    }

    // Sync current activity settings to manual activity
    await this.system.config.setZoneActivityManualSync(
      this.context.zone,
      await firstValueFrom(this.system.getZoneActivity(this.context.zone)),
    );
    // Update manual activity fan speed to switch between auto and manual
    await this.system.config.setZoneActivityManualFan(
      this.context.zone,
      value === this.Characteristic.TargetFanState.AUTO ?
        FAN_MODE.OFF :  // fan off is auto
        FAN_MODE.MED, // moving to manual defaults to med
    );
    // Enable manual activity hold
    await this.system.config.setZoneActivityHold(
      this.context.zone,
      ACTIVITY.MANUAL,
      await this.getHoldTime(),
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
