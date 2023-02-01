import { CharacteristicWrapper, MultiWrapper } from './characteristics_base';

class CurrentRH extends CharacteristicWrapper {
  ctype = this.Characteristic.CurrentRelativeHumidity;
  value = this.system.status.getZone(this.context.zone).humidity;
}

class TargetDehumidify extends CharacteristicWrapper {
  ctype = this.Characteristic.RelativeHumidityDehumidifierThreshold;
}

class TargetHumidify extends CharacteristicWrapper {
  ctype = this.Characteristic.RelativeHumidityHumidifierThreshold;
}


export class ThermostatRHService extends MultiWrapper {
  WRAPPERS = [
    CurrentRH,
  ];
}

export class HumidifierService extends MultiWrapper {
  WRAPPERS = [
    CurrentRH,
    TargetDehumidify,
    TargetHumidify,
  ];
}