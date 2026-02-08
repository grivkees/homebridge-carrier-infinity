import { CharacteristicWrapper, MultiWrapper, ThermostatCharacteristicWrapper } from './characteristics_base';
import { STATUS } from './api/constants';

class CurrentRH extends CharacteristicWrapper {
  ctype = this.Characteristic.CurrentRelativeHumidity;
  get = async () => {
    return await this.system.status.getZoneHumidity(this.context.zone);
  };
}

class HumidifierActive extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.Active;
  get = async () => {
    // Check if humidifier or dehumidifier is configured to be on for current activity
    const activity_name = await this.getActivity();
    const [c_humidifier, c_dehumidifier] = await Promise.all([
      this.system.config.getActivityHumidifierState(activity_name),
      this.system.config.getActivityDehumidifierState(activity_name),
    ]);
    if (c_humidifier === STATUS.OFF && c_dehumidifier === STATUS.OFF) {
      return this.Characteristic.Active.INACTIVE;
    } else {
      return this.Characteristic.Active.ACTIVE;
    }
  };

  set = async (value) => {
    const activity_name = await this.getActivity();
    const newState = value === this.Characteristic.Active.ACTIVE ? STATUS.ON : STATUS.OFF;
    // When activating, turn on humidifier; when deactivating, turn off both
    await this.system.config.setHumidityConfig(
      activity_name,
      newState,
      value === this.Characteristic.Active.INACTIVE ? STATUS.OFF : undefined,
    );
  };
}

class HumidifierCurrentState extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.CurrentHumidifierDehumidifierState;
  get = async () => {
    const activity_name = await this.getActivity();
    const [s_humidifier, s_dehumidifier, c_humidifier, c_dehumidifier] = await Promise.all([
      this.system.status.getHumidifier(),
      this.system.status.getDehumidifier(),
      this.system.config.getActivityHumidifierState(activity_name),
      this.system.config.getActivityDehumidifierState(activity_name),
    ]);
    if (s_humidifier === STATUS.ON) {
      return this.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
    } else if (s_dehumidifier === STATUS.ON) {
      return this.Characteristic.CurrentHumidifierDehumidifierState.DEHUMIDIFYING;
    } else if (c_humidifier === STATUS.ON || c_dehumidifier === STATUS.ON) {
      return this.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    } else {
      return this.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    }
  };
}

class HumidifierTargetState extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.TargetHumidifierDehumidifierState;
  get = async () => {
    const activity_name = await this.getActivity();
    const [humidifier, dehumidifier] = await Promise.all([
      this.system.config.getActivityHumidifierState(activity_name),
      this.system.config.getActivityDehumidifierState(activity_name),
    ]);
    if (humidifier === STATUS.ON && dehumidifier === STATUS.OFF) {
      return this.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
    } else if (humidifier === STATUS.OFF && dehumidifier === STATUS.ON) {
      return this.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER;
    } else {
      // Both on or both off - return auto mode
      return this.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER;
    }
  };

  set = async (value) => {
    const activity_name = await this.getActivity();
    let humidifier: string;
    let dehumidifier: string;

    switch (value) {
      case this.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER:
        humidifier = STATUS.ON;
        dehumidifier = STATUS.OFF;
        break;
      case this.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER:
        humidifier = STATUS.OFF;
        dehumidifier = STATUS.ON;
        break;
      case this.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER:
      default:
        humidifier = STATUS.ON;
        dehumidifier = STATUS.ON;
        break;
    }

    await this.system.config.setHumidityConfig(activity_name, humidifier, dehumidifier);
  };
}

class TargetDehumidifyPoint extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.RelativeHumidityDehumidifierThreshold;
  // API only accepts 46, 48, 50, 52, 54, 56, 58 (2% steps) but we use minStep: 1
  // to avoid conflicts with humidifier's 5% steps. Rounding in get/set handles alignment.
  props = {minValue: 46, maxValue: 58, minStep: 1};
  default_value = 58;

  get = async () => {
    const activity_name = await this.getActivity();
    // Model returns actual percentage (46-58%)
    const target = await this.system.config.getActivityDehumidifierTarget(activity_name);
    // Round to nearest valid step (46, 48, 50, 52, 54, 56, 58)
    const clamped = Math.min(58, Math.max(46, target));
    return Math.round((clamped - 46) / 2) * 2 + 46;
  };

  set = async (value) => {
    const activity_name = await this.getActivity();
    // Round to nearest valid step (46, 48, 50, 52, 54, 56, 58)
    const clamped = Math.min(58, Math.max(46, Number(value)));
    const rounded = Math.round((clamped - 46) / 2) * 2 + 46;
    // setHumidityConfig expects actual percentage
    await this.system.config.setHumidityConfig(
      activity_name,
      undefined,
      undefined,
      undefined,
      rounded,
    );
  };
}

class TargetHumidifyPoint extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.RelativeHumidityHumidifierThreshold;
  // API only accepts 5, 10, 15, 20, 25, 30, 35, 40, 45 (5% steps) but we use minStep: 1
  // to match dehumidifier on the same slider. Rounding in get/set handles alignment.
  props = {minValue: 5, maxValue: 45, minStep: 1};
  default_value = 35;

  get = async () => {
    const activity_name = await this.getActivity();
    // Model returns actual percentage (5-45%)
    const target = await this.system.config.getActivityHumidifierTarget(activity_name);
    // Round to nearest valid step (5, 10, 15, 20, 25, 30, 35, 40, 45)
    const clamped = Math.min(45, Math.max(5, target));
    return Math.round(clamped / 5) * 5;
  };

  set = async (value) => {
    const activity_name = await this.getActivity();
    // Round to nearest valid step (5, 10, 15, 20, 25, 30, 35, 40, 45)
    const clamped = Math.min(45, Math.max(5, Number(value)));
    const rounded = Math.round(clamped / 5) * 5;
    // setHumidityConfig expects actual percentage
    await this.system.config.setHumidityConfig(
      activity_name,
      undefined,
      undefined,
      rounded,
    );
  };
}


export class ThermostatRHService extends MultiWrapper {
  WRAPPERS = [
    CurrentRH,
  ];
}

export class HumidifierService extends MultiWrapper {
  WRAPPERS = [
    CurrentRH,
    HumidifierActive,
    HumidifierCurrentState,
    HumidifierTargetState,
    TargetHumidifyPoint,
    TargetDehumidifyPoint,
  ];
}
