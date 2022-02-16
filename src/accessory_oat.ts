import { PlatformAccessory } from 'homebridge';
import { CarrierInfinityHomebridgePlatform } from './platform';
import { AccessoryInformation, CharacteristicWrapper, MultiWrapper } from './base';
import { convertSystemTemp2CharTemp } from './helpers';

class OATSensorTemp extends CharacteristicWrapper {
  ctype = this.Characteristic.CurrentTemperature;
  get = async () => {
    return convertSystemTemp2CharTemp(
      await this.system.status.getOutdoorTemp(),
      'F', // The oat from the api is always in F (#97)
    );
  };
}

export class OutdoorTempSensorService extends MultiWrapper {
  WRAPPERS = [OATSensorTemp];
}

export class OutdoorTemperatureAccessory {
  constructor(
    private readonly platform: CarrierInfinityHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    new OutdoorTempSensorService(
      this.platform,
      this.accessory.context,
    ).wrap(
      this.accessory.getService(this.platform.Service.TemperatureSensor) ||
      this.accessory.addService(this.platform.Service.TemperatureSensor),
    );
  
    new AccessoryInformation(
      this.platform,
      this.accessory.context,
    ).wrap(
      this.accessory.getService(this.platform.Service.AccessoryInformation) ||
      this.accessory.addService(this.platform.Service.AccessoryInformation),
    );

  }
}