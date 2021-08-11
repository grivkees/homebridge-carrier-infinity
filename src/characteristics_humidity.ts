import { CharacteristicWrapper, MultiWrapper, ThermostatCharacteristicWrapper } from './characteristics_base';
import { convertSystemDehum2CharDehum, convertSystemHum2CharHum } from './helpers';
import { STATUS } from './infinityApi';

class CurrentRH extends CharacteristicWrapper {
  ctype = this.Characteristic.CurrentRelativeHumidity;
  get = async () => {
    return await this.system.status.getZoneHumidity(this.context.zone);
  };
}

class HumidifierActive extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.Active;
  get = async () => {
    // I'd rather use 'status' here instead of 'config', but if the accessory
    // is inactive HomeKit always shows the target state as off.
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
      // both off also returns here, but HumidifierActive handles that.
      return this.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER;
    }
  };
}

class TargetDehumidifyPoint extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.RelativeHumidityDehumidifierThreshold;
  props = {minValue: 46, maxValue: 58, minStep: 2};
  default_value = 58;

  get = async () => {
    return convertSystemDehum2CharDehum(
      await this.system.config.getActivityDehumidifierTarget(
        await this.getActivity(),
      ),
    );
  };
}

class TargetHumidifyPoint extends ThermostatCharacteristicWrapper {
  ctype = this.Characteristic.RelativeHumidityHumidifierThreshold;
  props = {minValue: 5, maxValue: 45, minStep: 5};
  default_value = 5;

  get = async () => {
    return convertSystemHum2CharHum(
      await this.system.config.getActivityHumidifierTarget(
        await this.getActivity(),
      ),
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