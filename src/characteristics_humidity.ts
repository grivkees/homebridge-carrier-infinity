import { CharacteristicWrapper, MultiWrapper } from './base';

class CurrentRH extends CharacteristicWrapper {
  ctype = this.Characteristic.CurrentRelativeHumidity;
  get = async () => {
    return await this.system.status.getZoneHumidity(this.context.zone);
  };
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